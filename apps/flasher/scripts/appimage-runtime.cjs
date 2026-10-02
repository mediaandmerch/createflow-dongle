/* electron-builder `afterAllArtifactBuild` hook.
 *
 * electron-builder's AppImages start with a runtime that dlopens libfuse.so.2, which
 * Ubuntu 22.04+ and Fedora no longer install by default - the app then dies with
 * "AppImages require FUSE to run". This swaps in the AppImage project's statically linked
 * type2 runtime (MIT), which brings its own FUSE client. The runtime lives in
 * build/appimage-runtime: the binaries from the project's "continuous" release that were tested
 * in a Linux VM on 2026-09-10. They used to be downloaded on every build, but "continuous" is
 * replaced upstream without notice (by 2026-10-01 neither file existed there any more, and the
 * pin below stopped the build), so they ship with the repo instead. The pin still guards
 * against a swapped file. */
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");

const RUNTIMES = {
  x86_64: { file: "runtime-x86_64", sha256: "1cc49bcf1e2ccd593c379adb17c9f85a36d619088296504de95b1d06215aebbf" },
  arm64: { file: "runtime-aarch64", sha256: "7d5d772b7c32f0c84caf0a452a3072a5709027d7eac5856feb89a7a7a8881372" },
};

function runtimeFor(arch) {
  const { file, sha256 } = RUNTIMES[arch];
  const data = readFileSync(join(__dirname, "..", "build", "appimage-runtime", file));
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== sha256) throw new Error(`${file}: SHA-256 is ${actual}, expected ${sha256} - not the runtime that was tested`);
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
    writeFileSync(path, Buffer.concat([runtimeFor(arch), image.subarray(squashfsOffset(image))]));
    console.log(`  • static AppImage runtime  file=${basename(path)} arch=${arch}`);
  }
  return [];
};
