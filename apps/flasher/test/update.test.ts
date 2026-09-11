import { describe, expect, it } from "vitest";
import { isNewer, parseLatestRelease } from "../src/shared/update.js";

describe("isNewer", () => {
  it("compares the numbers, with or without v", () => {
    expect(isNewer("v0.1.3", "0.1.2")).toBe(true);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
  });
  it("is false for the same or an older version", () => {
    expect(isNewer("v0.1.2", "0.1.2")).toBe(false);
    expect(isNewer("0.1.1", "0.1.2")).toBe(false);
  });
  it("is false for anything that isn't x.y.z", () => {
    for (const bad of ["", "latest", "0.2", "0.3.0-beta", "v1.2.3.4", "🚀"]) expect(isNewer(bad, "0.1.2")).toBe(false);
  });
});

describe("parseLatestRelease", () => {
  const ok = { tag_name: "v0.1.3", html_url: "https://github.com/mediaandmerch/createflow-dongle/releases/tag/v0.1.3", draft: false, prerelease: false };
  it("takes version and page from GitHub's reply", () => {
    expect(parseLatestRelease(ok)).toEqual({ version: "0.1.3", url: ok.html_url });
  });
  it("ignores drafts, pre-releases, foreign links and anything that isn't a release", () => {
    expect(parseLatestRelease({ ...ok, draft: true })).toBeNull();
    expect(parseLatestRelease({ ...ok, prerelease: true })).toBeNull();
    expect(parseLatestRelease({ ...ok, html_url: "https://example.com/flasher.dmg" })).toBeNull();
    expect(parseLatestRelease({ message: "Not Found" })).toBeNull();
    for (const bad of [null, undefined, "x", 42, []]) expect(parseLatestRelease(bad)).toBeNull();
  });
});
