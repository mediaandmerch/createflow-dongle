/*
 * Nordic's serial DFU protocol (nRF5 SDK "DFU protocol" + "serial DFU transport"), written
 * against the Transport interface so the same code runs in the CLI and in the flasher app.
 *
 * Sequence, as pc-nrfutil (nordicsemi/dfu/dfu_transport_serial.py) does it:
 *   ping -> set PRN 0 -> get MTU -> init packet (object type 1) -> firmware (object type 2)
 * Each object: CREATE(type, size) -> WRITE in chunks -> CALC_CRC check -> EXECUTE.
 * The firmware is sent in objects of the size the bootloader reports (4096 bytes on the
 * nRF52840 dongle). After the last EXECUTE the bootloader starts the new firmware and the
 * port disappears.
 *
 * No resume after an interrupted transfer: a full flash takes about ten seconds and the
 * init packet resets the bootloader's data offset anyway, so starting over is just as fast.
 */
import type { Transport } from "./transport.js";
import { SlipDecoder, slipEncode } from "./slip.js";
import { crc32 } from "./crc32.js";
import type { DfuPackage } from "./package.js";

const OP = {
  CREATE: 0x01,
  SET_PRN: 0x02,
  CALC_CRC: 0x03,
  EXECUTE: 0x04,
  SELECT: 0x06,
  GET_MTU: 0x07,
  WRITE: 0x08,
  PING: 0x09,
  RESPONSE: 0x60,
} as const;

const OBJECT = { INIT: 0x01, DATA: 0x02 } as const;

const RESULT_SUCCESS = 0x01;
const RESULT_EXT_ERROR = 0x0b;

/** Result codes (RES_CODE in pc-nrfutil). */
const RESULT_TEXT: Record<number, string> = {
  0x00: "invalid code",
  0x02: "command not supported",
  0x03: "invalid parameter",
  0x04: "insufficient resources",
  0x05: "invalid object",
  0x06: "invalid signature",
  0x07: "object type not supported",
  0x08: "operation not permitted",
  0x0a: "operation failed",
};

/** Extended error codes (EXT_ERROR_CODE in pc-nrfutil), worded for the user. */
const EXT_TEXT: Record<number, string> = {
  0x04: "init packet is invalid (wrong update type or missing fields)",
  0x05: "the firmware version is lower than what's on the stick — the bootloader doesn't allow downgrades",
  0x06: "hardware version mismatch — this package wasn't built for the nRF52840",
  0x07: "SoftDevice version does not match",
  0x08: "the bootloader requires a signed package, but this one isn't signed",
  0x09: "hash type not supported",
  0x0a: "hash could not be calculated",
  0x0b: "signature type not supported",
  0x0c: "the firmware hash doesn't match the init packet",
  0x0d: "not enough space on the stick",
  0x0e: "this exact firmware is already on the stick",
};

export class DfuError extends Error {
  constructor(message: string, readonly opcode?: number, readonly result?: number, readonly ext?: number) {
    super(message);
    this.name = "DfuError";
  }
}

export interface DfuProgress {
  phase: "connecting" | "init" | "firmware" | "done";
  sent: number;
  total: number;
}

export interface DfuOptions {
  onProgress?: (p: DfuProgress) => void;
  /** Bootloader response timeout per command. */
  timeoutMs?: number;
}

/** Sends SLIP frames and matches replies to the one pending request. */
class Link {
  private pending: { resolve: (d: Uint8Array) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly decoder = new SlipDecoder((m) => this.received(m));
  private readonly unsubscribe: () => void;

  constructor(private readonly transport: Transport, private readonly timeoutMs: number) {
    this.unsubscribe = transport.onData((chunk) => this.decoder.feed(chunk));
  }

  private received(message: Uint8Array): void {
    const p = this.pending;
    if (!p) return;   // stray reply from an earlier attempt
    this.pending = null;
    clearTimeout(p.timer);
    p.resolve(message);
  }

  /** Send a message and wait for the next complete reply. */
  async request(bytes: number[] | Uint8Array, timeoutMs = this.timeoutMs): Promise<Uint8Array> {
    if (this.pending) throw new DfuError("Internal error: request while another one is pending");
    const reply = new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new DfuError(`No response from the bootloader within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending = { resolve, timer };
    });
    await this.transport.write(slipEncode(Uint8Array.from(bytes)));
    return reply;
  }

  /** Send without expecting a reply (WRITE with PRN 0). */
  send(bytes: Uint8Array): Promise<void> {
    return this.transport.write(slipEncode(bytes));
  }

  close(): void {
    this.unsubscribe();
    if (this.pending) { clearTimeout(this.pending.timer); this.pending = null; }
  }
}

const byte = (d: Uint8Array, i: number) => d[i] ?? 0;
const u16 = (d: Uint8Array, i: number) => byte(d, i) | (byte(d, i + 1) << 8);
const u32 = (d: Uint8Array, i: number) =>
  (byte(d, i) | (byte(d, i + 1) << 8) | (byte(d, i + 2) << 16) | (byte(d, i + 3) << 24)) >>> 0;
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

/** Validate a reply [0x60, opcode, result, ...payload] and return the payload. */
function payload(reply: Uint8Array, opcode: number): Uint8Array {
  const [head = -1, op = -1, result = -1, ext = -1] = reply;
  if (head !== OP.RESPONSE) throw new DfuError(`Unexpected reply 0x${head.toString(16)} instead of a response`, opcode);
  if (op !== opcode) throw new DfuError(`Reply to command 0x${op.toString(16)} instead of 0x${opcode.toString(16)}`, opcode);
  if (result === RESULT_SUCCESS) return reply.subarray(3);
  if (result === RESULT_EXT_ERROR) {
    throw new DfuError(EXT_TEXT[ext] ?? `extended error 0x${ext.toString(16)}`, opcode, result, ext);
  }
  throw new DfuError(RESULT_TEXT[result] ?? `error code 0x${result.toString(16)}`, opcode, result);
}

/**
 * Flash a DFU package onto the bootloader. The transport must already be open on the
 * bootloader's port (115200 8N1). Throws DfuError with a user-facing message.
 */
export async function flash(transport: Transport, pkg: DfuPackage, opts: DfuOptions = {}): Promise<void> {
  if (pkg.initPacket.length === 0 || pkg.firmware.length === 0) {
    throw new DfuError("DFU package is empty (init packet or firmware missing)");
  }
  const timeoutMs = opts.timeoutMs ?? 5000;
  const progress = opts.onProgress ?? (() => {});
  const link = new Link(transport, timeoutMs);

  try {
    progress({ phase: "connecting", sent: 0, total: 0 });
    await ping(link, Math.min(1000, timeoutMs));
    payload(await link.request([OP.SET_PRN, 0, 0]), OP.SET_PRN);
    const mtu = u16(payload(await link.request([OP.GET_MTU]), OP.GET_MTU), 0);
    if (mtu < 8) throw new DfuError(`Bootloader reports an unusable MTU of ${mtu}`);
    /* A WRITE frame may be at most mtu bytes after SLIP encoding; worst case SLIP doubles
     * every byte, plus opcode and END. Same arithmetic as the reference. */
    const chunkSize = Math.floor((mtu - 1) / 2) - 1;

    await sendObject(link, OBJECT.INIT, pkg.initPacket, chunkSize,
      (sent) => progress({ phase: "init", sent, total: pkg.initPacket.length }));
    await sendObject(link, OBJECT.DATA, pkg.firmware, chunkSize,
      (sent) => progress({ phase: "firmware", sent, total: pkg.firmware.length }));

    progress({ phase: "done", sent: pkg.firmware.length, total: pkg.firmware.length });
  } finally {
    link.close();
  }
}

/** The bootloader does not answer immediately after enumeration; the reference pings for up to 30 s. */
async function ping(link: Link, timeoutMs: number): Promise<void> {
  for (let i = 1; i <= 15; i++) {
    const id = i & 0xff;
    try {
      const r = await link.request([OP.PING, id], timeoutMs);
      if (byte(r, 0) === OP.RESPONSE && byte(r, 1) === OP.PING && byte(r, 2) === RESULT_SUCCESS && byte(r, 3) === id) return;
    } catch (e) {
      if (!(e instanceof DfuError) || !/No response/.test(e.message)) throw e;
    }
  }
  throw new DfuError("The bootloader isn't responding. Is the stick plugged in, with its LED pulsing red?");
}

/**
 * Transfer one object type (init packet or firmware). The bootloader accepts data only in
 * objects up to the size it reports; each is created, written, CRC-checked and executed.
 */
async function sendObject(link: Link, type: number, data: Uint8Array, chunkSize: number,
                          progress: (sent: number) => void): Promise<void> {
  const sel = payload(await link.request([OP.SELECT, type]), OP.SELECT);
  const maxSize = u32(sel, 0);
  if (maxSize === 0) throw new DfuError("Bootloader reports an object size of 0", OP.SELECT);

  let runningCrc = 0;
  for (let start = 0; start < data.length; start += maxSize) {
    const block = data.subarray(start, Math.min(start + maxSize, data.length));

    payload(await link.request([OP.CREATE, type, ...le32(block.length)]), OP.CREATE);

    for (let i = 0; i < block.length; i += chunkSize) {
      const chunk = block.subarray(i, Math.min(i + chunkSize, block.length));
      await link.send(Uint8Array.from([OP.WRITE, ...chunk]));
      runningCrc = crc32(chunk, runningCrc);
      progress(start + i + chunk.length);
    }

    const crcReply = payload(await link.request([OP.CALC_CRC]), OP.CALC_CRC);
    const offset = u32(crcReply, 0);
    const crc = u32(crcReply, 4);
    const expectedOffset = start + block.length;
    if (offset !== expectedOffset || crc !== runningCrc) {
      throw new DfuError(
        `Transfer corrupted: bootloader has ${offset} bytes (CRC ${crc.toString(16)}), ` +
        `expected ${expectedOffset} (CRC ${runningCrc.toString(16)}). Unplug the stick, plug it back in, and try again.`,
        OP.CALC_CRC);
    }

    /* The last EXECUTE starts the new firmware; the bootloader usually still replies, but
     * sometimes the port is already gone. Both mean success. */
    const last = type === OBJECT.DATA && expectedOffset >= data.length;
    try {
      payload(await link.request([OP.EXECUTE]), OP.EXECUTE);
    } catch (e) {
      if (!last || !(e instanceof DfuError) || e.result !== undefined) throw e;
    }
  }
}
