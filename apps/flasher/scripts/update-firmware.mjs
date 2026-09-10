// Copy the most recently built firmware package (firmware/dist) into the app.
// Usage: npm run firmware -w @createflow-dongle/flasher
import { copyFileSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const dist = join(root, "firmware/dist");
const target = join(root, "apps/flasher/firmware");
const version = readFileSync(join(dist, "app-version"), "utf8").trim();
const file = `createflow-dongle-v${version}.zip`;

for (const old of readdirSync(target)) if (old.endsWith(".zip") && old !== file) unlinkSync(join(target, old));
copyFileSync(join(dist, "createflow-dongle.zip"), join(target, file));
writeFileSync(join(target, "firmware.json"), JSON.stringify({ file, version }, null, 1) + "\n");
console.log(`flasher firmware: ${file}`);
