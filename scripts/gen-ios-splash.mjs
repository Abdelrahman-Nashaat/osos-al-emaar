// Generates apple-touch-startup-image PNGs for common iOS device classes.
// Brand-dark background (#0f172a) with the app icon centered. iOS shows these
// as the launch screen for an installed PWA (the manifest alone doesn't).
// Run: node scripts/gen-ios-splash.mjs   (prints the <link> tags to stdout)
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";

const OUT = "public/splash";
const BG = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a
// [portraitWidth, portraitHeight, deviceWidth, deviceHeight, pixelRatio]
const DEVICES = [
  [1170, 2532, 390, 844, 3], // iPhone 12/13/14
  [1179, 2556, 393, 852, 3], // iPhone 15/16
  [1284, 2778, 428, 926, 3], // iPhone Pro Max
  [1125, 2436, 375, 812, 3], // iPhone X/11 Pro
  [750, 1334, 375, 667, 2], // iPhone SE
  [1536, 2048, 768, 1024, 2], // iPad
  [1668, 2388, 834, 1194, 2], // iPad Pro 11"
];

const icon = await readFile("public/icons/icon-512.png");
await mkdir(OUT, { recursive: true });

const links = [];
for (const [w, h, dw, dh, ratio] of DEVICES) {
  const size = Math.round(Math.min(w, h) * 0.4);
  const logo = await sharp(icon).resize(size, size).png().toBuffer();
  const file = `apple-splash-${w}x${h}.png`;
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`${OUT}/${file}`);
  links.push(
    `<link rel="apple-touch-startup-image" media="(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)" href="/splash/${file}" />`,
  );
}
console.log(links.join("\n"));
