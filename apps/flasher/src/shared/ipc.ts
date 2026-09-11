import type { Step } from "@createflow-dongle/dfu";

export type StickStatus =
  | { kind: "none" }
  | { kind: "bootloader"; path: string }
  | { kind: "bridge"; path: string };

export type FlashResult = { ok: true } | { ok: false; error: string };

/** A newer release than the running one, from GitHub. */
export interface UpdateInfo { version: string; url: string }

export interface FlasherApi {
  flash(): Promise<FlashResult>;
  getInfo(): Promise<{ version: string; firmwareVersion: string; firmwareBytes: number }>;
  onStatus(cb: (s: StickStatus) => void): () => void;
  onStep(cb: (s: Step) => void): () => void;
  /** A newer release found at start; null when there is none or the check failed. */
  getUpdate(): Promise<UpdateInfo | null>;
  onUpdate(cb: (u: UpdateInfo | null) => void): () => void;
  /** Opens the release page of the newer version in the browser. */
  openUpdate(): Promise<void>;
  /** Whether the app may ask GitHub for new releases (on by default). */
  getUpdateCheck(): Promise<boolean>;
  setUpdateCheck(on: boolean): Promise<boolean>;
}
