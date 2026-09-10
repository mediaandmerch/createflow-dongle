import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Own packages (ESM) are bundled into the main process; serialport stays external (native module).
const own = ["@createflow-dongle/dfu", "@createflow-dongle/serial"];

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: own })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] },
});
