import { app, BrowserWindow, ipcMain, Menu, net, shell } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readDfuPackage, flashStick, type Step } from "@createflow-dongle/dfu";
import { findDonglePorts, serialDevices } from "@createflow-dongle/serial";
import type { FlashResult, StickStatus, UpdateInfo } from "../shared/ipc.js";
import { isNewer, parseLatestRelease } from "../shared/update.js";

let win: BrowserWindow | null = null;

const LATEST_RELEASE_URL = "https://api.github.com/repos/mediaandmerch/createflow-dongle/releases/latest";
let update: UpdateInfo | null = null;
/** The app's only network request: the newest release on GitHub, once per start, so people
 *  learn about fixed firmware. Offline or an error status just leave the notice away. */
async function checkForUpdate(): Promise<void> {
  try {
    const res = await net.fetch(LATEST_RELEASE_URL, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) { console.log(`[update] GitHub answered ${res.status}`); return; }
    const latest = parseLatestRelease(await res.json());
    update = latest && isNewer(latest.version, app.getVersion()) ? latest : null;
    win?.webContents.send("update", update);
  } catch (e) {
    console.log(`[update] ${(e as Error).message}`);
  }
}
ipcMain.handle("getUpdate", () => update);
// parseLatestRelease only lets github.com links through
ipcMain.handle("openUpdate", () => (update ? shell.openExternal(update.url) : undefined));

/* The firmware package ships next to the app (extraResources), in development it sits in
 * the project folder. firmware.json names the file and its version. */
function firmwareFile(): { path: string; version: string } {
  const dir = app.isPackaged ? join(process.resourcesPath, "firmware") : join(app.getAppPath(), "firmware");
  const manifest = JSON.parse(readFileSync(join(dir, "firmware.json"), "utf8")) as { file: string; version: string };
  return { path: join(dir, manifest.file), version: manifest.version };
}

/* Stick status once a second - paused while flashing, because listing ports would
 * interfere with the DFU transfer. */
let flashing = false;
async function reportStatus(): Promise<void> {
  if (flashing || !win) return;
  const ports = await findDonglePorts();
  const boot = ports.find((p) => p.state === "bootloader");
  const bridge = ports.find((p) => p.state === "bridge");
  const status: StickStatus = boot ? { kind: "bootloader", path: boot.path }
    : bridge ? { kind: "bridge", path: bridge.path } : { kind: "none" };
  win.webContents.send("status", status);
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 480, height: 580, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: "#1b1c20", title: "createflow Dongle",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  if (process.env["ELECTRON_RENDERER_URL"]) void w.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  else void w.loadFile(join(__dirname, "../renderer/index.html"));
  w.on("closed", () => { win = null; });
  return w;
}

ipcMain.handle("getInfo", () => {
  const fw = firmwareFile();
  const pkg = readDfuPackage(new Uint8Array(readFileSync(fw.path)));
  return { version: app.getVersion(), firmwareVersion: fw.version, firmwareBytes: pkg.firmware.length };
});

ipcMain.handle("flash", async (): Promise<FlashResult> => {
  if (flashing) return { ok: false, error: "A flash is already running." };
  flashing = true;
  try {
    const pkg = readDfuPackage(new Uint8Array(readFileSync(firmwareFile().path)));
    await flashStick(serialDevices, pkg, { onStep: (s: Step) => win?.webContents.send("step", s) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    flashing = false;
  }
});

void app.whenReady().then(() => {
  /* One window, one button - Electron's default File/Edit/View menu bar has nothing to offer. */
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  app.setAboutPanelOptions({
    applicationName: "createflow Dongle",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Sünkel Media & Merch\nFür Jesus. Für Menschen.",
  });
  /* In development the app runs inside Electron's own bundle; the dock shows its icon
   * unless we set ours. The name only changes with a real build. */
  if (process.platform === "darwin" && !app.isPackaged) {
    app.dock?.setIcon(join(app.getAppPath(), "build/icon.png"));
  }
  win = createWindow();
  setInterval(() => void reportStatus(), 1000);
  void checkForUpdate();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) win = createWindow(); });
});
app.on("window-all-closed", () => app.quit());
