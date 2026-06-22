// scripts/generate-brand-assets.mjs
// One-off script: generate all favicon / apple-touch / PWA icon sizes from
// public/brand_logo/Logo_ori_png.png (745x745, cyan-blue gradient).
//
// Run: node scripts/generate-brand-assets.mjs
// After running, uninstall sharp: `npm uninstall sharp`

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_PNG = join(ROOT, "public/brand_logo/Logo_ori_png.png");
const OUT = join(ROOT, "public");

// SVG icon: simple, scalable, sharp at any size
// Gradient matches the source PNG (cyan-to-blue, rounded square).
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#g)"/>
  <path d="M6 22V11l5-3 5 3v11M11 22v-5h5v5M11 15h5" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

const SPEC = [
  // file,              size,           format, fit
  ["favicon.ico",       48,             "ico",   "contain"],
  ["favicon-16x16.png", 16,             "png",   "contain"],
  ["favicon-32x32.png", 32,             "png",   "contain"],
  ["apple-touch-icon.png", 180,         "png",   "contain"],
  ["android-chrome-192x192.png", 192,   "png",   "contain"],
  ["android-chrome-512x512.png", 512,   "png",   "contain"],
  ["mstile-150x150.png", 150,           "png",   "contain"],
];

async function main() {
  const srcBuffer = await readFile(SRC_PNG);
  const src = sharp(srcBuffer);
  const meta = await src.metadata();
  console.log(`Source: ${SRC_PNG.replace(ROOT + "\\", "")} (${meta.width}x${meta.height})`);

  for (const [filename, size, format, fit] of SPEC) {
    const out = join(OUT, filename);
    let pipeline = sharp(srcBuffer).resize(size, size, {
      fit,
      background: { r: 34, g: 211, b: 238, alpha: 1 },
      kernel: "lanczos3",
    });

    if (format === "ico") {
      // sharp's .ico output is single-size. Wrap PNG into ICO container manually.
      const pngBuf = await pipeline.png().toBuffer();
      // Minimal ICO header for a single PNG-encoded image
      const icoBuf = await wrapPngInIco(pngBuf, size);
      await writeFile(out, icoBuf);
    } else {
      await pipeline.png({ compressionLevel: 9, quality: 90 }).toFile(out);
    }
    const stat = await import("node:fs/promises").then((m) => m.stat(out));
    console.log(`  ${filename.padEnd(32)} ${size}x${size}  ${(stat.size / 1024).toFixed(1)} KB`);
  }

  // Write icon.svg
  await writeFile(join(OUT, "icon.svg"), ICON_SVG, "utf8");
  const svgStat = await import("node:fs/promises").then((m) => m.stat(join(OUT, "icon.svg")));
  console.log(`  icon.svg${" ".repeat(26)} scalable        ${(svgStat.size / 1024).toFixed(1)} KB`);

  console.log("\nDone. Now run: npm uninstall sharp");
}

/**
 * Wrap a single PNG buffer into a minimal .ico container.
 * Supports sizes up to 256x256 (PNG-compressed entry, Vista+).
 * For multi-size .ico (16+32+48), use a proper library — sharp doesn't support.
 * Single-size .ico works in all modern browsers.
 */
async function wrapPngInIco(pngBuf, size) {
  // ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) + PNG data
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);      // reserved
  dir.writeUInt16LE(1, 2);      // type: 1 = icon
  dir.writeUInt16LE(1, 4);      // count: 1 image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height
  entry.writeUInt8(0, 2);       // palette
  entry.writeUInt8(0, 3);       // reserved
  entry.writeUInt16LE(1, 4);    // color planes
  entry.writeUInt16LE(32, 6);   // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);   // image size
  entry.writeUInt32LE(22, 12);  // offset (6 + 16)

  return Buffer.concat([dir, entry, pngBuf]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
