/* electron-builder `afterAllArtifactBuild` hook.
 *
 * electron-builder's AppImages start with a runtime that dlopens libfuse.so.2, which
 * Ubuntu 22.04+ and Fedora no longer install by default - the app then dies with
 * "AppImages require FUSE to run". This swaps in the AppImage project's statically linked
 * type2 runtime, which brings its own FUSE client. The runtime comes from the project's
 * "continuous" release and is pinned by SHA-256, so a changed upstream binary fails the
 * build instead of shipping unnoticed. */
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");

const RELEASE = "https://github.com/AppImage/type2-runtime/releases/download/continuous/";
const RUNTIMES = {
  x86_64: { file: "runtime-x86_64", sha256: "1cc49bcf1e2ccd593c379adb17c9f85a36d619088296504de95b1d06215aebbf" },
  arm64: { file: "runtime-aarch64", sha256: "7d5d772b7c32f0c84caf0a452a3072a5709027d7eac5856feb89a7a7a8881372" },
};

async function runtimeFor(arch) {
  const { file, sha256 } = RUNTIMES[arch];
  const cache = join(__dirname, "..", "node_modules", ".cache", "appimage-runtime");
  const path = join(cache, `${file}-${sha256.slice(0, 8)}`);
  if (!existsSync(path)) {
    const res = await fetch(RELEASE + file);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    mkdirSync(cache, { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const data = readFileSync(path);
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== sha256) {
    unlinkSync(path);
    throw new Error(`${file}: SHA-256 is ${actual}, expected ${sha256} - upstream changed, review before updating the pin`);
  }
  return data;
}

/* An AppImage is [ELF runtime][squashfs]. The squashfs begins right after the ELF's section
 * header table: e_shoff + e_shnum * e_shentsize (ELF64 header fields). */
function squashfsOffset(image) {
  if (image.readUInt32BE(0) !== 0x7f454c46 || image[4] !== 2) throw new Error("not an ELF64 AppImage");
  const offset = Number(image.readBigUInt64LE(0x28)) + image.readUInt16LE(0x3a) * image.readUInt16LE(0x3c);
  if (image.toString("latin1", offset, offset + 4) !== "hsqs") throw new Error(`no squashfs at offset ${offset}`);
  return offset;
}

module.exports = async function afterAllArtifactBuild({ artifactPaths }) {
  for (const path of artifactPaths.filter((p) => p.endsWith(".AppImage"))) {
    const arch = /-arm64\.AppImage$/.test(path) ? "arm64" : "x86_64";
    const image = readFileSync(path);
    writeFileSync(path, Buffer.concat([await runtimeFor(arch), image.subarray(squashfsOffset(image))]));
    console.log(`  • static AppImage runtime  file=${basename(path)} arch=${arch}`);
  }
  return [];
};
