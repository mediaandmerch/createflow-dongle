import type { Step } from "@createflow-dongle/dfu";

export type StickStatus =
  | { kind: "none" }
  | { kind: "bootloader"; path: string }
  | { kind: "bridge"; path: string };

export type FlashResult = { ok: true } | { ok: false; error: string };

export interface FlasherApi {
  flash(): Promise<FlashResult>;
  getInfo(): Promise<{ version: string; firmwareVersion: string; firmwareBytes: number }>;
  onStatus(cb: (s: StickStatus) => void): () => void;
  onStep(cb: (s: Step) => void): () => void;
}
