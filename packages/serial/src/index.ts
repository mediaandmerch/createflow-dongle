/*
 * The dongle has two faces on USB, both under Nordic's test VID 0x1915:
 *   0x521F  Nordic's open DFU bootloader (factory state of the EBYTE E104-BT5040U, or after
 *           the 1200 baud touch) - this is where flashing happens
 *   0x520F  the bridge firmware - running, can be sent to the bootloader with the touch
 */
import { SerialPort } from "serialport";
import type { Devices, StickPort, Transport } from "@createflow-dongle/dfu";

export const DONGLE_VID = 0x1915;
export const PID_BOOTLOADER = 0x521f;
export const PID_BRIDGE = 0x520f;

export async function findDonglePorts(): Promise<StickPort[]> {
  const out: StickPort[] = [];
  for (const p of await SerialPort.list()) {
    if (parseInt(p.vendorId ?? "", 16) !== DONGLE_VID) continue;
    const pid = parseInt(p.productId ?? "", 16);
    const state = pid === PID_BOOTLOADER ? "bootloader" : pid === PID_BRIDGE ? "bridge" : null;
    if (!state) continue;
    /* macOS lists both tty. and cu.; cu. is the one to open */
    const path = process.platform === "darwin" ? p.path.replace("/dev/tty.", "/dev/cu.") : p.path;
    if (!out.some((o) => o.path === path)) out.push({ path, state });
  }
  return out;
}

function openPort(path: string, baudRate: number): Promise<SerialPort> {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate, dataBits: 8, parity: "none", stopBits: 1, rtscts: false, autoOpen: false });
    port.open((err) => {
      if (!err) return resolve(port);
      const hint = /lock|busy|unavailable|access/i.test(err.message) ? " Is another program using the port?" : "";
      reject(new Error(`Cannot open ${path}: ${err.message}.${hint}`));
    });
  });
}

/**
 * 1200 baud touch: open the bridge firmware's port at 1200 baud and close it again. The
 * firmware watches for exactly this rate (firmware/src/dfu_trigger.c) and reboots into the
 * bootloader; the port disappears and the bootloader's port shows up.
 */
export async function touch1200(path: string): Promise<void> {
  const port = await openPort(path, 1200);
  await new Promise<void>((r) => setTimeout(r, 300));
  await new Promise<void>((r) => port.close(() => r()));
}

/** Open the bootloader's port as a Transport (115200 8N1, DTR/RTS asserted). */
export async function openTransport(path: string): Promise<Transport> {
  const port = await openPort(path, 115200);
  await new Promise<void>((resolve, reject) => port.set({ dtr: true, rts: true }, (e) => (e ? reject(e) : resolve())));

  const listeners = new Set<(c: Uint8Array) => void>();
  port.on("data", (buf: Buffer) => {
    const chunk = new Uint8Array(buf);
    for (const l of listeners) l(chunk);
  });

  return {
    write: (bytes) =>
      new Promise<void>((resolve, reject) => {
        port.write(Buffer.from(bytes), (err) => {
          if (err) return reject(err);
          port.drain((e) => (e ? reject(e) : resolve()));
        });
      }),
    onData: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    close: () => new Promise<void>((resolve) => (port.isOpen ? port.close(() => resolve()) : resolve())),
  };
}

/** Everything flashStick() needs, wired to serialport. */
export const serialDevices: Devices = { findPorts: findDonglePorts, touch1200, open: openTransport };
