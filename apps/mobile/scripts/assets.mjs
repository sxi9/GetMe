// Renders store icons and splash screens for each app target from the SVG
// icons in apps/web/public, then runs @capacitor/assets to fan them out into
// every Android/iOS size. Usage: pnpm assets   (from apps/mobile)
import pw from '/opt/node-tools/node_modules/playwright/index.js'; const { chromium } = pw; // sandbox path; on a dev machine: import { chromium } from 'playwright'
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const targets = { customer: 'GetMe', partner: 'GetMe Partner', shop: 'GetMe Shops' };
const browser = await chromium.launch();
for (const [t, name] of Object.entries(targets)) {
  const dir = join(root, 'resources', t); mkdirSync(dir, { recursive: true });
  const svg = readFileSync(join(root, '..', 'web', 'public', `icon-${t}.svg`), 'utf8');
  const glyph = svg.replace(/<rect[^>]*\/>/, '').replace(/<svg[^>]*>|<\/svg>/g, '');
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  // icon (1024, rounded square drawn by the store), foreground (glyph on transparent), background (flat colour)
  await page.setContent(`<body style="margin:0;background:#14534A"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">${glyph}</svg></body>`);
  await page.screenshot({ path: join(dir, 'icon.png') });
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="680" height="680">${glyph}</svg></div></body>`);
  await page.screenshot({ path: join(dir, 'icon-foreground.png'), omitBackground: true });
  await page.setContent(`<body style="margin:0;background:#14534A"></body>`);
  await page.screenshot({ path: join(dir, 'icon-background.png') });
  const splash = await browser.newPage({ viewport: { width: 2732, height: 2732 } });
  await splash.setContent(`<body style="margin:0;background:#14534A;font-family:Manrope,system-ui,sans-serif"><div style="height:2732px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="420" height="420">${glyph}</svg><div style="color:#fff;font-size:120px;font-weight:700;letter-spacing:-2px">${name}</div></div></body>`);
  await splash.screenshot({ path: join(dir, 'splash.png') });
  await splash.setContent(`<body style="margin:0;background:#0E2F2A;font-family:Manrope,system-ui,sans-serif"><div style="height:2732px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="420" height="420">${glyph}</svg><div style="color:#fff;font-size:120px;font-weight:700;letter-spacing:-2px">${name}</div></div></body>`);
  await splash.screenshot({ path: join(dir, 'splash-dark.png') });
  console.log('rendered', t);
  // fan out into native projects when they exist
  if (existsSync(join(root, t, 'android')) || existsSync(join(root, t, 'ios'))) {
    try { execSync(`npx --yes @capacitor/assets@4.0.0 generate --assetPath ../resources/${t} --iconBackgroundColor '#14534A' --iconBackgroundColorDark '#0E2F2A' --splashBackgroundColor '#14534A' --splashBackgroundColorDark '#0E2F2A' ${existsSync(join(root, t, 'android')) ? '--android' : ''} ${existsSync(join(root, t, 'ios')) ? '--ios' : ''}`, { cwd: join(root, t), stdio: 'inherit' }); }
    catch (e) { console.warn('capacitor-assets failed for', t, '(install sharp-compatible platform or run it on a dev machine)'); }
  }
}
await browser.close();
