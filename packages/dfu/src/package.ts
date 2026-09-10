/*
 * DFU package as produced by `nrfutil pkg generate`: a ZIP with manifest.json, the init
 * packet (.dat) and the firmware (.bin). Only the application entry is supported;
 * SoftDevice or bootloader updates are not part of this project.
 */
import { unzipSync } from "fflate";

export interface DfuPackage {
  initPacket: Uint8Array;
  firmware: Uint8Array;
}

interface Manifest {
  manifest?: { application?: { bin_file?: string; dat_file?: string } };
}

export function readDfuPackage(zip: Uint8Array): DfuPackage {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch (e) {
    throw new Error(`Not a valid ZIP: ${(e as Error).message}`);
  }
  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new Error("manifest.json is missing from the DFU package");
  const app = (JSON.parse(new TextDecoder().decode(manifestRaw)) as Manifest).manifest?.application;
  if (!app?.bin_file || !app.dat_file) throw new Error("DFU package has no application entry");
  const firmware = files[app.bin_file];
  const initPacket = files[app.dat_file];
  if (!firmware || !initPacket) throw new Error(`Files missing from the package: ${app.bin_file}, ${app.dat_file}`);
  if (firmware.length === 0 || initPacket.length === 0) throw new Error("Firmware or init packet is empty");
  return { initPacket, firmware };
}
