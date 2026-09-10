import { contextBridge, ipcRenderer } from "electron";
import type { FlasherApi, StickStatus } from "../shared/ipc.js";
import type { Step } from "@createflow-dongle/dfu";

const on = <T,>(channel: string, cb: (v: T) => void) => {
  const handler = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.off(channel, handler); };
};

const api: FlasherApi = {
  flash: () => ipcRenderer.invoke("flash"),
  getInfo: () => ipcRenderer.invoke("getInfo"),
  onStatus: (cb) => on<StickStatus>("status", cb),
  onStep: (cb) => on<Step>("step", cb),
};
contextBridge.exposeInMainWorld("flasher", api);
