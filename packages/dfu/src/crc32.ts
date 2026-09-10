/* CRC-32 (IEEE, same as zlib). Own copy because zlib.crc32 only exists from Node 22.2 and
 * this also runs in Electron's main process. Cumulative: crc32(part2, crc32(part1)). */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, previous = 0): number {
  let c = ~previous >>> 0;
  for (const b of data) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}
