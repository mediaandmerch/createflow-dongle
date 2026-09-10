#!/usr/bin/env node
// Flash a DFU package onto the dongle from the command line - the same path the flasher app
// takes behind its button. Usage: npm run flash [-- path/to/package.zip]
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flashStick, readDfuPackage } from "@createflow-dongle/dfu";
import { serialDevices } from "@createflow-dongle/serial";

const file = resolve(process.argv[2] ?? "firmware/dist/createflow-dongle.zip");
const pkg = readDfuPackage(new Uint8Array(await readFile(file)));
console.log(`Package: ${file} (firmware ${pkg.firmware.length} bytes, init ${pkg.initPacket.length} bytes)`);

let width = 0;
const line = (text) => { process.stdout.write("\r" + text.padEnd(width)); width = Math.max(width, text.length); };
const describe = (s) => {
  switch (s.kind) {
    case "search": return "Looking for the stick …";
    case "touch": return `Bridge firmware on ${s.path} - sending 1200 baud touch …`;
    case "wait-bootloader": return `Waiting for the bootloader … ${s.secondsLeft} s`;
    case "flash": {
      const p = s.progress;
      if (p.phase === "connecting") return "Bootloader is responding …";
      if (p.phase === "done") return "Transferred, stick is restarting.";
      return `${p.phase === "init" ? "Init packet" : "Firmware"} ${p.sent}/${p.total} bytes (${Math.round((100 * p.sent) / p.total)} %)`;
    }
    case "done": return "Done.";
  }
};

try {
  await flashStick(serialDevices, pkg, { onStep: (s) => line(describe(s)) });
  process.stdout.write("\n");
} catch (e) {
  process.stdout.write("\n");
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
