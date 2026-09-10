import { describe, expect, it } from "vitest";
import { flashStick, NoStickError, type Devices, type StickPort, type Step } from "../src/index.js";
import { FakeBootloader } from "./fake-bootloader.js";

function devices(initial: StickPort[], afterTouch: StickPort[] = []) {
  let ports = initial;
  const d = {
    touches: [] as string[],
    opened: [] as string[],
    async findPorts() { return ports; },
    async touch1200(path: string) { d.touches.push(path); ports = afterTouch; },
    async open(path: string) { d.opened.push(path); return new FakeBootloader(); },
  } satisfies Devices & { touches: string[]; opened: string[] };
  return d;
}
const pkg = { initPacket: new Uint8Array(20).fill(1), firmware: new Uint8Array(300).fill(2) };

describe("flashStick", () => {
  it("flashes a stick in the bootloader directly, without a touch", async () => {
    const d = devices([{ path: "/dev/cu.boot", state: "bootloader" }]);
    const kinds: string[] = [];
    await flashStick(d, pkg, { onStep: (s: Step) => kinds.push(s.kind) });
    expect(d.touches).toEqual([]);
    expect(d.opened).toEqual(["/dev/cu.boot"]);
    expect(kinds[0]).toBe("search");
    expect(kinds.at(-1)).toBe("done");
  });

  it("touches a running bridge and waits for the bootloader", async () => {
    const d = devices([{ path: "/dev/cu.bridge", state: "bridge" }], [{ path: "/dev/cu.boot", state: "bootloader" }]);
    await flashStick(d, pkg, { bootloaderWaitMs: 2000 });
    expect(d.touches).toEqual(["/dev/cu.bridge"]);
    expect(d.opened).toEqual(["/dev/cu.boot"]);
  });

  it("explains what to do when no bootloader appears after the touch", async () => {
    const d = devices([{ path: "/dev/cu.bridge", state: "bridge" }], []);
    await expect(flashStick(d, pkg, { bootloaderWaitMs: 600 })).rejects.toThrow(/reset button/);
  });

  it("says what to plug in when there is no stick", async () => {
    await expect(flashStick(devices([]), pkg)).rejects.toThrow(NoStickError);
  });
});
