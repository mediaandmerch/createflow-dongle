/*
 * The whole path from a plugged-in stick to running firmware - what the flasher app does
 * behind its one button and what the CLI calls too. Knows nothing about serialport: port
 * discovery, the 1200 baud touch and opening are passed in (packages/serial provides
 * them), which also makes the flow testable with a fake.
 */
import type { Transport } from "./transport.js";
import { flash, DfuError, type DfuProgress } from "./protocol.js";
import type { DfuPackage } from "./package.js";

export interface StickPort {
  path: string;
  state: "bootloader" | "bridge";
}

export interface Devices {
  findPorts(): Promise<StickPort[]>;
  /** 1200 baud touch on the bridge firmware: the stick reboots into the bootloader. */
  touch1200(path: string): Promise<void>;
  /** Open the bootloader's port (115200 8N1). */
  open(path: string): Promise<Transport>;
}

export type Step =
  | { kind: "search" }
  | { kind: "touch"; path: string }
  | { kind: "wait-bootloader"; secondsLeft: number }
  | { kind: "flash"; progress: DfuProgress }
  | { kind: "done" };

export interface FlowOptions {
  onStep?: (s: Step) => void;
  /** How long to wait for the bootloader after the touch. */
  bootloaderWaitMs?: number;
}

export class NoStickError extends Error {
  constructor() {
    super("No stick found. Please plug in the nRF52840 stick (EBYTE E104-BT5040U).");
    this.name = "NoStickError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor(devices: Devices, state: StickPort["state"], ms: number,
                       tick?: (secondsLeft: number) => void): Promise<StickPort | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const port = (await devices.findPorts()).find((p) => p.state === state);
    if (port) return port;
    tick?.(Math.ceil((deadline - Date.now()) / 1000));
    await sleep(500);
  }
  return null;
}

export async function flashStick(devices: Devices, pkg: DfuPackage, opts: FlowOptions = {}): Promise<void> {
  const onStep = opts.onStep ?? (() => {});
  const bootloaderWaitMs = opts.bootloaderWaitMs ?? 15000;

  onStep({ kind: "search" });
  const ports = await devices.findPorts();
  let target = ports.find((p) => p.state === "bootloader");
  const bridge = ports.find((p) => p.state === "bridge");
  if (!target && !bridge) throw new NoStickError();

  if (!target && bridge) {
    onStep({ kind: "touch", path: bridge.path });
    await devices.touch1200(bridge.path);
    target = await waitFor(devices, "bootloader", bootloaderWaitMs,
      (secondsLeft) => onStep({ kind: "wait-bootloader", secondsLeft })) ?? undefined;
    if (!target) {
      throw new DfuError(
        "The stick did not show up in the bootloader after the 1200 baud touch. " +
        "Unplug it, hold the reset button, plug it in (LED pulses red) and try again.");
    }
    /* macOS needs a moment after the port appears before it can be opened. */
    await sleep(1500);
  }

  const transport = await devices.open(target!.path);
  try {
    await flash(transport, pkg, { onProgress: (progress) => onStep({ kind: "flash", progress }) });
  } finally {
    await transport.close();
  }
  onStep({ kind: "done" });
}
