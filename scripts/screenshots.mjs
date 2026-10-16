// Takes product screenshots in demo mode (used for README / store listings).
// Usage: npm run build && npm run screenshots
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.env.OUT ?? 'docs/screenshots';
const PORT = 4174;
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];

async function shoot(name, { width, height, mobile, dark, path, before }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: dark ? 'dark' : 'light',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    geolocation: { latitude: 50.1109, longitude: 8.6821 },
    permissions: ['geolocation'],
  });
  await ctx.addInitScript(() => {
    localStorage.setItem(
      'tankradar.settings',
      JSON.stringify({ state: { onboarded: true, lang: 'de', fuel: 'e10', radiusKm: 5, location: { lat: 50.1109, lng: 8.6821 }, locationLabel: 'Frankfurt am Main', provider: 'demo' }, version: 1 }),
    );
    localStorage.setItem(
      'tankradar.route',
      JSON.stringify({ state: { from: { lat: 50.1109, lng: 8.6821, label: 'Frankfurt am Main' }, to: { lat: 48.1372, lng: 11.5755, label: 'München' }, fuelPct: 20, corridorKm: 3, stopPenalty: 2, endFuelPct: 0 }, version: 0 }),
    );
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/tiles|openfreemap|Failed to load resource|photon|osrm|routing/i.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  await page.goto(`http://localhost:${PORT}/#${path}`);
  await page.waitForTimeout(1500);
  if (before) await before(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

const planRoute = async (page) => {
  await page.getByRole('button', { name: /Route planen/ }).click();
  await page.waitForSelector('.trip', { timeout: 30000 });
  await page.waitForTimeout(800);
};

const firstStation = async (page) => {
  await page.goto(page.url().replace(/#.*/, '#/'));
  await page.waitForSelector('.station-row');
  await page.locator('.station-row').first().click();
  await page.waitForSelector('.station-page .chart svg');
  await page.waitForTimeout(800);
};

const desktop = { width: 1440, height: 900, mobile: false };
const phone = { width: 390, height: 844, mobile: true };

await shoot('desktop-radar', { ...desktop, path: '/' });
await shoot('desktop-station', { ...desktop, path: '/', before: firstStation });
await shoot('desktop-stats', { ...desktop, path: '/stats', before: async (p) => { await p.goto(p.url().replace(/#.*/, '#/')); await p.waitForSelector('.station-row'); await p.goto(p.url().replace(/#.*/, '#/stats')); await p.waitForTimeout(1500); } });
await shoot('desktop-route', { ...desktop, path: '/route', before: planRoute });
await shoot('desktop-radar-dark', { ...desktop, dark: true, path: '/' });
await shoot('mobile-radar', { ...phone, path: '/' });
await shoot('mobile-station', { ...phone, path: '/', before: firstStation });
await shoot('mobile-route', { ...phone, path: '/route', before: planRoute });
await shoot('mobile-calc', { ...phone, path: '/calc', before: async (p) => { await p.getByRole('radio', { name: 'Umweg lohnt?' }).click(); await p.waitForTimeout(300); } });
await shoot('mobile-station-dark', { ...phone, dark: true, path: '/', before: firstStation });
await shoot('mobile-settings', { ...phone, path: '/settings' });

await browser.close();
process.kill(-server.pid);
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log('Screenshots written to', OUT);
