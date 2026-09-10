/*
 * A Transport that behaves like Nordic's open bootloader on the nRF52840 dongle (MTU 256,
 * 4096-byte objects), so the protocol can be tested without hardware - including the
 * failure paths that are hard to provoke on a real stick.
 */
import type { Transport } from "../src/index.js";
import { SlipDecoder, slipEncode, crc32 } from "../src/index.js";

export interface FakeOptions {
  mtu?: number;
  maxObject?: number;
  /** Reject the init packet as a downgrade (ext error 0x05). */
  downgrade?: boolean;
  /** Never answer. */
  silent?: boolean;
  /** Report a wrong CRC on CALC_CRC. */
  corruptCrc?: boolean;
  /** Stop answering after the EXECUTE that completes a firmware of this size (app started). */
  resetAfterFirmwareBytes?: number;
}

export class FakeBootloader implements Transport {
  readonly initReceived: number[] = [];
  readonly firmwareReceived: number[] = [];
  readonly opcodes: number[] = [];
  private listener: ((c: Uint8Array) => void) | null = null;
  private objectType = 0;
  private object: number[] = [];
  private state: Record<number, { data: number[]; executed: number }> = {
    1: { data: [], executed: 0 },
    2: { data: [], executed: 0 },
  };
  private readonly decoder = new SlipDecoder((m) => this.handle(m));

  constructor(private readonly o: FakeOptions = {}) {}

  async write(bytes: Uint8Array): Promise<void> { this.decoder.feed(bytes); }
  onData(cb: (chunk: Uint8Array) => void): () => void {
    this.listener = cb;
    return () => { this.listener = null; };
  }
  async close(): Promise<void> {}

  private reply(bytes: number[]): void {
    if (this.o.silent || !this.listener) return;
    /* USB CDC delivers in pieces - split every reply in two on purpose. */
    const encoded = slipEncode(Uint8Array.from(bytes));
    const mid = Math.max(1, Math.floor(encoded.length / 2));
    const l = this.listener;
    setTimeout(() => { l(encoded.subarray(0, mid)); l(encoded.subarray(mid)); }, 0);
  }

  private handle(m: Uint8Array): void {
    const op = m[0]!;
    this.opcodes.push(op);
    const ok = (data: number[] = []) => this.reply([0x60, op, 0x01, ...data]);
    const le32 = (x: number) => [x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff];

    switch (op) {
      case 0x09: ok([m[1]!]); break;                                            // PING
      case 0x02: ok(); break;                                                   // SET_PRN
      case 0x07: { const mtu = this.o.mtu ?? 256; ok([mtu & 0xff, mtu >> 8]); break; }  // GET_MTU
      case 0x06: {                                                              // SELECT
        const s = this.state[m[1]!]!;
        ok([...le32(this.o.maxObject ?? 4096), ...le32(s.data.length), ...le32(crc32(Uint8Array.from(s.data)))]);
        break;
      }
      case 0x01: {                                                              // CREATE
        this.objectType = m[1]!;
        this.object = [];
        if (this.objectType === 2 && this.state[1]!.executed === 0) { this.reply([0x60, op, 0x08]); break; }
        ok();
        break;
      }
      case 0x08: this.object.push(...m.subarray(1)); break;                     // WRITE, no reply at PRN 0
      case 0x03: {                                                              // CALC_CRC
        const s = this.state[this.objectType]!;
        const all = Uint8Array.from([...s.data, ...this.object]);
        ok([...le32(all.length), ...le32(this.o.corruptCrc ? 0xdeadbeef : crc32(all))]);
        break;
      }
      case 0x04: {                                                              // EXECUTE
        const s = this.state[this.objectType]!;
        if (this.objectType === 1 && this.o.downgrade) { this.reply([0x60, op, 0x0b, 0x05]); break; }
        s.data.push(...this.object);
        s.executed++;
        if (this.objectType === 1) { this.initReceived.push(...this.object); this.state[2] = { data: [], executed: 0 }; }
        else this.firmwareReceived.push(...this.object);
        this.object = [];
        if (this.objectType === 2 && this.o.resetAfterFirmwareBytes !== undefined &&
            this.firmwareReceived.length >= this.o.resetAfterFirmwareBytes) break;
        ok();
        break;
      }
      default: this.reply([0x60, op, 0x02]);
    }
  }
}
