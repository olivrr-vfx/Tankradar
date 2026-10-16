// Renders all PNG icons (PWA, Apple touch, Android launcher, store graphics) from assets/*.svg.
// Usage: npm run icons   (Tauri desktop icons: npx tauri icon assets/icon-1024.png)
import { Resvg } from '@resvg/resvg-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
const icon = readFileSync(join(root, 'assets/icon.svg'), 'utf8');
const fg = readFileSync(join(root, 'assets/icon-foreground.svg'), 'utf8');
const BG = '#0d1726';

function render(svg, size, background) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background });
  return r.render().asPng();
}
function out(path, buf) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buf);
  console.log('✓', path);
}
// Full-bleed square (no rounded corners) for maskable / iOS / Android legacy
const square = icon.replace('rx="230"', 'rx="0"');

out('assets/icon-1024.png', render(icon, 1024));
out('public/icons/icon-192.png', render(icon, 192));
out('public/icons/icon-512.png', render(icon, 512));
out('public/icons/maskable-512.png', render(fg.replace('<defs>', `<rect width="1024" height="1024" fill="${BG}"/><defs>`), 512));
out('public/icons/apple-touch-icon.png', render(square, 180));
out('public/icons/badge-72.png', render(fg, 72));

// Android launcher icons (only if the native project exists)
const android = join(root, 'android/app/src/main/res');
if (existsSync(android)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, f] of Object.entries(dens)) {
    out(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, render(icon, Math.round(48 * f)));
    out(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, render(icon.replace('rx="230"', 'rx="512"'), Math.round(48 * f)));
    out(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, render(fg, Math.round(108 * f)));
  }
  out('android/app/src/main/res/values/ic_launcher_background.xml', Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`));
}
// iOS app icon (only if the native project exists)
const ios = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
if (existsSync(ios)) out('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', render(square, 1024));

// Social preview
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><radialGradient id="g" cx="0.2" cy="0" r="1"><stop offset="0" stop-color="#2f5bff" stop-opacity="0.55"/><stop offset="1" stop-color="#0d1726" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="#0d1726"/><rect width="1200" height="630" fill="url(#g)"/>
<g transform="translate(90 175) scale(0.27)">${icon.replace(/<\/?svg[^>]*>/g, '')}</g>
<text x="420" y="300" font-family="Inter, Helvetica, Arial, sans-serif" font-size="96" font-weight="800" fill="#ffffff">Tankradar</text>
<text x="424" y="370" font-family="Inter, Helvetica, Arial, sans-serif" font-size="36" fill="#b4bdd0">Günstig tanken. Zur richtigen Zeit.</text>
<text x="424" y="420" font-family="Inter, Helvetica, Arial, sans-serif" font-size="36" fill="#b4bdd0">Am richtigen Ort.</text>
<text x="424" y="500" font-family="Inter, Helvetica, Arial, sans-serif" font-size="26" fill="#10c5c1">Open Source · Kostenlos · Ohne Werbung</text></svg>`;
out('public/og-image.png', render(og, 1200));

// Splash screens: logo centred on the brand background, rendered at each existing size.
import { readdirSync } from 'node:fs';
const splashSvg = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.28);
  const inner = icon.replace(/<svg[^>]*>/, '').replace('</svg>', '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BG}"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 1024})">${inner}</g></svg>`;
};
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
function splashes(dir, match) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { recursive: true })) {
    if (!match(String(entry))) continue;
    const path = join(dir, String(entry));
    const { w, h } = pngSize(readFileSync(path));
    writeFileSync(path, new Resvg(splashSvg(w, h)).render().asPng());
    console.log('✓ splash', path.replace(root + '/', ''), `${w}x${h}`);
  }
}
splashes(join(root, 'android/app/src/main/res'), (p) => p.endsWith('splash.png'));
splashes(join(root, 'ios/App/App/Assets.xcassets/Splash.imageset'), (p) => p.endsWith('.png'));
