// Reports elements that stick out of the viewport on a small phone (regression check for layout bugs).
// Usage: npm run build && node scripts/audit-overflow.mjs
import { spawn } from 'node:child_process';
import { chromium, devices } from 'playwright';

const PORT = 4177;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ ...devices['iPhone SE'], locale: 'de-DE' });
await ctx.addInitScript(() => {
  localStorage.setItem('tankradar.settings', JSON.stringify({ state: { onboarded: true, installHintDismissed: true, lang: 'de', location: { lat: 50.11, lng: 8.68 }, locationLabel: 'Frankfurt am Main', provider: 'demo' }, version: 1 }));
  localStorage.setItem('tankradar.route', JSON.stringify({ state: { from: { lat: 50.1109, lng: 8.6821, label: 'Frankfurt am Main' }, to: { lat: 48.1372, lng: 11.5755, label: 'München' }, fuelPct: 20, corridorKm: 3, stopPenalty: 2, endFuelPct: 0 }, version: 0 }));
});
const page = await ctx.newPage();
const pages = ['/', '/stats', '/route', '/calc', '/favorites', '/logbook', '/settings', '/more'];
let problems = 0;
async function audit(label) {
  const res = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.map, .maplibregl-map, svg, .skip-link')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // ignore children of horizontally scrollable containers
      let p = el.parentElement, scrollable = false;
      while (p) { const s = getComputedStyle(p); if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) { scrollable = true; break; } p = p.parentElement; }
      if (scrollable) continue;
      if (r.right > W + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} [${Math.round(r.left)}–${Math.round(r.right)}]`);
    }
    return { W, scrollW: document.documentElement.scrollWidth, out: [...new Set(out)].slice(0, 12) };
  });
  if (res.out.length || res.scrollW > res.W) {
    problems++;
    console.log(`✗ ${label} (viewport ${res.W}, scroll ${res.scrollW})\n   ${res.out.join('\n   ')}`);
  } else console.log(`✓ ${label}`);
}
for (const p of pages) {
  await page.goto(`http://localhost:${PORT}/#${p}`);
  await page.waitForTimeout(1200);
  await audit(p);
}
await page.goto(`http://localhost:${PORT}/#/`);
await page.waitForSelector('.station-row');
await page.locator('.station-row').first().click();
await page.waitForTimeout(1500);
await audit('/station');
await page.goto(`http://localhost:${PORT}/#/route`);
await page.getByRole('button', { name: /Route planen/ }).click();
await page.waitForSelector('.trip', { timeout: 30000 });
await audit('/route (result)');
await page.goto(`http://localhost:${PORT}/#/logbook`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Tankvorgang erfassen/ }).first().click();
await page.waitForTimeout(500);
await audit('/logbook (modal)');
await browser.close();
process.kill(-server.pid);
process.exitCode = problems ? 1 : 0;
