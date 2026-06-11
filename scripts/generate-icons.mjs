// One-shot PWA icon rasterizer (Phase 4.5 C1): renders public/icon.svg into the
// PNG set Android/iOS installs actually need. Run: node scripts/generate-icons.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public", "icon.svg");
const outDir = path.join(root, "public", "icons");
await mkdir(outDir, { recursive: true });

// purpose:any — straight raster.
for (const size of [192, 512]) {
  await sharp(src, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
}

// purpose:maskable — the safe zone is the inner 80%; pad the glyph on a solid
// brand background so launchers can crop to any shape without clipping it.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.7);
  const glyph = await sharp(src, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#0f172a" },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, `maskable-${size}.png`));
}

// iOS home-screen icon (apple-touch-icon, 180px, opaque background).
const appleGlyph = await sharp(src, { density: 384 }).resize(140, 140).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: "#0f172a" } })
  .composite([{ input: appleGlyph, gravity: "center" }])
  .png()
  .toFile(path.join(root, "public", "apple-touch-icon.png"));

console.log("icons generated: icons/icon-{192,512}.png, icons/maskable-{192,512}.png, apple-touch-icon.png");
