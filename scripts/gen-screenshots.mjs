// Placeholder branded screenshots for the PWA install card (Android shows a
// richer card when the manifest has screenshots). Regenerate any time.
// Run: node scripts/gen-screenshots.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const icon = await readFile("public/icons/icon-512.png");
const BG = { r: 15, g: 23, b: 42, alpha: 1 };

for (const [file, w, h] of [
  ["screenshot-mobile.png", 1080, 1920],
  ["screenshot-wide.png", 1920, 1080],
]) {
  const logo = await sharp(icon)
    .resize(Math.round(Math.min(w, h) * 0.3))
    .png()
    .toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/${file}`);
}
console.log("screenshots generated");
