/**
 * Generates branded placeholder images for the demo (portfolio covers, a
 * sample drawing sheet, a site photo) into scripts/demo/assets/.
 * Arabic text is shaped by librsvg via sharp's SVG input.
 * Run: node scripts/demo/make-images.mjs
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join("scripts", "demo", "assets");
mkdirSync(OUT, { recursive: true });

const COVERS = [
  { file: "portfolio-villa-modern.png", title: "فيلا سكنية حديثة", sub: "تصميم معماري — الخبر", c1: "#0f766e", c2: "#134e4a" },
  { file: "portfolio-villa-classic.png", title: "فيلا كلاسيكية", sub: "تصميم وإشراف — الدمام", c1: "#1e3a8a", c2: "#1e293b" },
  { file: "portfolio-commercial.png", title: "مبنى تجاري", sub: "تصميم إنشائي — الظهران", c1: "#92400e", c2: "#451a03" },
  { file: "portfolio-compound.png", title: "مجمع سكني", sub: "إشراف هندسي — الجبيل", c1: "#5b21b6", c2: "#2e1065" },
  { file: "portfolio-renovation.png", title: "ترميم وإعادة تأهيل", sub: "تصميم داخلي — الدمام", c1: "#9f1239", c2: "#4c0519" },
  { file: "portfolio-mosque.png", title: "مسجد حي", sub: "تصميم معماري — الخبر", c1: "#065f46", c2: "#022c22" },
];

function coverSvg(t) {
  return `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${t.c1}"/><stop offset="1" stop-color="${t.c2}"/>
  </linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <g opacity="0.1" stroke="#ffffff" stroke-width="2" fill="none">
    <rect x="90" y="200" width="360" height="380"/>
    <rect x="160" y="300" width="100" height="100"/>
    <rect x="300" y="300" width="100" height="180"/>
    <line x1="90" y1="200" x2="450" y2="200"/>
    <path d="M90 200 L270 90 L450 200"/>
  </g>
  <text x="600" y="430" font-family="Tahoma, Arial, sans-serif" font-size="76" font-weight="bold"
        fill="#ffffff" text-anchor="middle" direction="rtl">${t.title}</text>
  <text x="600" y="500" font-family="Tahoma, Arial, sans-serif" font-size="36"
        fill="#ffffff" opacity="0.85" text-anchor="middle" direction="rtl">${t.sub}</text>
  <text x="600" y="740" font-family="Tahoma, Arial, sans-serif" font-size="30"
        fill="#ffffff" opacity="0.7" text-anchor="middle" direction="rtl">شركة أسس الإعمار المتقدمة</text>
</svg>`;
}

function sheetSvg() {
  return `<svg width="1240" height="1754" xmlns="http://www.w3.org/2000/svg">
  <rect width="1240" height="1754" fill="#ffffff"/>
  <rect x="40" y="40" width="1160" height="1674" fill="none" stroke="#0f172a" stroke-width="3"/>
  <g stroke="#475569" stroke-width="1.5" fill="none">
    <rect x="120" y="160" width="640" height="520"/>
    <rect x="220" y="280" width="180" height="180"/>
    <rect x="470" y="280" width="180" height="280"/>
    <line x1="120" y1="160" x2="760" y2="160"/>
    <line x1="120" y1="420" x2="760" y2="420"/>
  </g>
  <text x="620" y="120" font-family="Tahoma, Arial" font-size="44" font-weight="bold" fill="#0f172a"
        text-anchor="middle" direction="rtl">مخطط معماري — مسقط أفقي للدور الأرضي</text>
  <text x="620" y="1640" font-family="Tahoma, Arial" font-size="30" fill="#475569"
        text-anchor="middle" direction="rtl">مقياس الرسم 1:100 — شركة أسس الإعمار المتقدمة</text>
</svg>`;
}

async function main() {
  for (const c of COVERS) {
    await sharp(Buffer.from(coverSvg(c))).png().toFile(join(OUT, c.file));
  }
  await sharp(Buffer.from(sheetSvg())).png().toFile(join(OUT, "drawing-ground-floor.png"));
  await sharp(
    Buffer.from(`<svg width="1280" height="960" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7dd3fc"/><stop offset="0.6" stop-color="#bae6fd"/>
        <stop offset="0.6" stop-color="#a8a29e"/><stop offset="1" stop-color="#78716c"/></linearGradient></defs>
      <rect width="1280" height="960" fill="url(#s)"/>
      <rect x="180" y="360" width="380" height="260" fill="#d6d3d1" stroke="#57534e" stroke-width="3"/>
      <rect x="620" y="300" width="300" height="320" fill="#e7e5e4" stroke="#57534e" stroke-width="3"/>
      <text x="640" y="900" font-family="Tahoma, Arial" font-size="40" fill="#1c1917"
            text-anchor="middle" direction="rtl">صورة من الموقع — مرحلة العظم</text>
    </svg>`),
  )
    .jpeg({ quality: 80 })
    .toFile(join(OUT, "site-photo.jpg"));

  console.log(`Generated ${COVERS.length} covers + drawing sheet + site photo in ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
