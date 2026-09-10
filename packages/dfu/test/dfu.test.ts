import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { crc32, flash, readDfuPackage, SlipDecoder, slipEncode } from "../src/index.js";
import { FakeBootloader } from "./fake-bootloader.js";

function pseudoRandom(n: number, seed = 7): Uint8Array {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out[i] = x & 0xff; }
  return out;
}
const pkg = (firmwareLength: number) => ({ initPacket: pseudoRandom(140, 3), firmware: pseudoRandom(firmwareLength, 5) });
const manifest = (bin: string, dat: string) =>
  new TextEncoder().encode(JSON.stringify({ manifest: { application: { bin_file: bin, dat_file: dat } } }));

describe("SLIP", () => {
  it("escapes END and ESC and decodes them back byte by byte", () => {
    const raw = Uint8Array.from([0x01, 0xc0, 0x02, 0xdb, 0x03]);
    const encoded = slipEncode(raw);
    expect(Array.from(encoded)).toEqual([0x01, 0xdb, 0xdc, 0x02, 0xdb, 0xdd, 0x03, 0xc0]);
    const seen: Uint8Array[] = [];
    const d = new SlipDecoder((m) => seen.push(m));
    for (const b of encoded) d.feed(Uint8Array.from([b]));
    expect(seen.map((s) => Array.from(s))).toEqual([Array.from(raw)]);
  });

  it("discards a message with an invalid escape up to the next END", () => {
    const seen: Uint8Array[] = [];
    new SlipDecoder((m) => seen.push(m)).feed(Uint8Array.from([0x01, 0xdb, 0x99, 0x02, 0xc0, 0x07, 0xc0]));
    expect(seen.map((s) => Array.from(s))).toEqual([[0x07]]);
  });
});

describe("CRC-32", () => {
  it("matches zlib for the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("can be computed cumulatively", () => {
    expect(crc32(new TextEncoder().encode("6789"), crc32(new TextEncoder().encode("12345")))).toBe(0xcbf43926);
  });
});

describe("DFU package", () => {
  it("extracts init packet and firmware from the ZIP", () => {
    const p = readDfuPackage(zipSync({ "manifest.json": manifest("app.bin", "app.dat"), "app.bin": pseudoRandom(10), "app.dat": pseudoRandom(5) }));
    expect(p.firmware.length).toBe(10);
    expect(p.initPacket.length).toBe(5);
  });
  it("rejects garbage, a missing manifest and empty files", () => {
    expect(() => readDfuPackage(pseudoRandom(50))).toThrow(/ZIP/);
    expect(() => readDfuPackage(zipSync({ "x.bin": pseudoRandom(3) }))).toThrow(/manifest/);
    expect(() => readDfuPackage(zipSync({ "manifest.json": manifest("a.bin", "a.dat"), "a.bin": new Uint8Array(0), "a.dat": pseudoRandom(5) }))).toThrow(/empty/);
  });
});

describe("flash against the fake bootloader", () => {
  it("transfers init packet and firmware across several objects and reports progress", async () => {
    const bl = new FakeBootloader();
    const p = pkg(4096 * 2 + 777);   // three objects, the last one partial
    const phases: string[] = [];
    let lastSent = 0;
    await flash(bl, p, { onProgress: (x) => { phases.push(x.phase); if (x.phase === "firmware") lastSent = x.sent; } });
    expect(bl.initReceived).toEqual(Array.from(p.initPacket));
    expect(bl.firmwareReceived).toEqual(Array.from(p.firmware));
    expect(phases[0]).toBe("connecting");
    expect(phases.at(-1)).toBe("done");
    expect(lastSent).toBe(p.firmware.length);
    expect(bl.opcodes.filter((o) => o === 0x01).length).toBe(1 + 3);   // 1 init + 3 data objects
  });

  it("keeps WRITE chunks within the MTU (SLIP worst case)", async () => {
    const bl = new FakeBootloader({ mtu: 64 });
    const p = pkg(500);
    await flash(bl, p);
    expect(bl.firmwareReceived).toEqual(Array.from(p.firmware));
  });

  it("names a downgrade", async () => {
    await expect(flash(new FakeBootloader({ downgrade: true }), pkg(100))).rejects.toThrow(/downgrade/);
  });

  it("detects a corrupted transfer via the CRC", async () => {
    await expect(flash(new FakeBootloader({ corruptCrc: true }), pkg(100))).rejects.toThrow(/Transfer corrupted/);
  });

  it("gives instructions instead of a bare timeout when the bootloader is silent", async () => {
    await expect(flash(new FakeBootloader({ silent: true }), pkg(100), { timeoutMs: 40 })).rejects.toThrow(/LED pulsing red/);
  });

  it("counts it as success when the bootloader restarts right after the last EXECUTE", async () => {
    const p = pkg(300);
    const bl = new FakeBootloader({ resetAfterFirmwareBytes: p.firmware.length });
    await expect(flash(bl, p, { timeoutMs: 300 })).resolves.toBeUndefined();
    expect(bl.firmwareReceived).toEqual(Array.from(p.firmware));
  });

  it("rejects an empty package instead of reporting success", async () => {
    const bl = new FakeBootloader();
    await expect(flash(bl, { initPacket: pseudoRandom(10), firmware: new Uint8Array(0) })).rejects.toThrow(/empty/);
    expect(bl.opcodes.length).toBe(0);
  });
});
