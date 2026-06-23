// scripts/regenerate-brand-assets.mjs
//
// One-off: regenerate brand assets in public/brand/ from the real source PNG.
//   - Source: public/brand_logo/Logo_ori_png.png (985 KB, 745x745, real brand)
//   - Outputs: 7 raster icons at correct sizes
//
// Run: node scripts/regenerate-brand-assets.mjs
// After: npm uninstall sharp

import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_PNG = join(ROOT, "public/brand_logo/Logo_ori_png.png");
const OUT_DIR = join(ROOT, "public/brand");

await mkdir(OUT_DIR, { recursive: true });

console.log("Reading source:", SRC_PNG);
const pngBuffer = await readFile(SRC_PNG);

const SPEC = [
  ["favicon.ico",                      48,    "ico"],
  ["favicon-16x16.png",                16,    "png"],
  ["favicon-32x32.png",                32,    "png"],
  ["apple-touch-icon.png",            180,    "png"],
  ["android-chrome-192x192.png",      192,    "png"],
  ["android-chrome-512x512.png",      512,    "png"],
  ["mstile-150x150.png",              150,    "png"],
];

console.log("Generating raster icons from real brand mark...");
for (const [filename, size, format] of SPEC) {
  const out = join(OUT_DIR, filename);
  let pipeline = sharp(pngBuffer).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    kernel: "lanczos3",
  });

  if (format === "ico") {
    const buf = await pipeline.png().toBuffer();
    const icoBuf = await wrapPngInIco(buf, size);
    await writeFile(out, icoBuf);
  } else {
    await pipeline.png({ compressionLevel: 9 }).toFile(out);
  }
  const stat = await import("node:fs/promises").then((m) => m.stat(out));
  console.log(`  ${filename.padEnd(32)} ${size}x${size}  ${(stat.size / 1024).toFixed(1)} KB`);
}

const noteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 745 745">
  <image href="/brand/android-chrome-192x192.png" width="745" height="745"/>
</svg>`;
await writeFile(join(OUT_DIR, "icon.svg"), noteSvg, "utf8");
console.log(`  icon.svg${" ".repeat(26)} wrapper     ${(noteSvg.length / 1024).toFixed(1)} KB`);

console.log("\nDone. Now run: npm uninstall sharp");

async function wrapPngInIco(pngBuf, size) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([dir, entry, pngBuf]);
}
