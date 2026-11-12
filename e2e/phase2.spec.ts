// Phase 2 flows through the UI: GPS deliver-to, leave-at-door handoff with a
// proof photo, crypto payment gating the handover, live vehicle marker, and a
// partner-announced trip that a customer joins and the runner completes.
import { test, expect, type Page, type Browser } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = join(import.meta.dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, name + '.png') });
const PNG = join(SHOTS, '_fixture.png');
writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const API = 'http://localhost:4100';
const PHONES = { customer: '9845012345', partner: '9986044112', runner: '9986044116' };

async function apiLogin(role: 'customer' | 'partner', phone: string) {
  const h = { 'content-type': 'application/json' };
  await fetch(`${API}/api/auth/otp`, { method: 'POST', headers: h, body: JSON.stringify({ phone, role }) });
  const r = await fetch(`${API}/api/auth/verify`, { method: 'POST', headers: h, body: JSON.stringify({ phone, role, code: '1234' }) });
  return (await r.json()).token as string;
}
async function signIn(browser: Browser, role: 'customer' | 'partner', phone: string, opts: { gps?: boolean } = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, ...(opts.gps ? { geolocation: { latitude: 12.9121, longitude: 77.6446 }, permissions: ['geolocation'] } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', e => { console.log(`[pageerror ${role}]`, e.stack ?? e.message); throw e; });
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|net::/.test(m.text())) console.log(`[console ${role}]`, m.text().slice(0, 900)); });
  await page.goto(`/${role}`);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('One-time code').fill('1234');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  return page;
}
const goOnline = async (partner: Page) => { await expect(partner.getByText(/You are (online|offline)/).first()).toBeVisible(); if (await partner.getByText('You are offline', { exact: true }).count()) await partner.locator('label:has(input[role=switch])').first().click(); await expect(partner.getByText('You are online', { exact: true })).toBeVisible(); };

test('trip: runner announces, customer joins from checkout, runner starts and delivers, trip completes', async ({ browser }) => {
  const runner = await signIn(browser, 'partner', PHONES.runner);
  const customer = await signIn(browser, 'customer', PHONES.customer);
  await goOnline(runner);
  await runner.getByRole('button', { name: 'Trips' }).click();
  await runner.getByRole('button', { name: 'Announce a trip' }).first().click();
  await runner.getByLabel('Trip name').fill('Evening market run');
  await runner.getByLabel('Going to').fill('Madiwala market');
  await runner.getByLabel('Fee per order (₹)').fill('25');
  await runner.getByRole('button', { name: 'Announce', exact: true }).click();
  await expect(runner.getByText('Evening market run').first()).toBeVisible();
  await shot(runner, '20-runner-trip-announced');

  await customer.getByPlaceholder('e.g. 2 kg onions').fill('Beans 1 kg');
  await customer.getByRole('button', { name: 'Start list' }).click();
  await customer.getByRole('button', { name: /Continue · 1 item/ }).click();
  await customer.getByText('Join a trip to town').click();
  const row = customer.getByRole('radio').filter({ hasText: /Lakshmi.*₹25/ }).first();
  await expect(row).toBeVisible();
  await row.click();
  await customer.getByText('Cash on delivery').click();
  await shot(customer, '21-customer-checkout-join-trip');
  await customer.getByRole('button', { name: /Join the trip/ }).click();
  await expect(customer.getByText(/Riding along/).first()).toBeVisible();
  await shot(customer, '22-customer-riding-along');

  await expect(runner.getByText(/1 of \d+ seats|Beans 1 kg/).first()).toBeVisible({ timeout: 20_000 });
  await runner.getByText('Evening market run').first().click();
  await expect(runner.getByText('Beans 1 kg').first()).toBeVisible();
  await shot(runner, '23-runner-trip-detail');
  await runner.getByRole('button', { name: /Start trip/ }).click();
  await expect(runner.getByText(/Trip · 1 of 1/).first()).toBeVisible();
  await shot(runner, '24-runner-trip-job');
  await runner.getByRole('button', { name: /Reached/ }).click();
  await runner.getByLabel('What you paid for the items (₹)').fill('60');
  await runner.getByRole('button', { name: /Items bought/ }).click();
  await runner.getByRole('button', { name: 'Arrived', exact: true }).click();
  const otp = (await customer.locator('.mono', { hasText: /^\d{4}$/ }).first().textContent())!.trim();
  await runner.getByLabel('Handover code').fill(otp);
  await runner.locator('label:has(input[type=checkbox]:not([role]))').first().click();
  await runner.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(runner.getByText(/Trip complete|you earned/).first()).toBeVisible();
  await shot(runner, '25-runner-trip-complete');
  await expect(customer.getByText(/Delivered by Lakshmi/).first()).toBeVisible();
});

test('GPS deliver-to, leave-at-door with proof photo, crypto payment gates the handover, live vehicle marker', async ({ browser }) => {
  // fixture: a saved apartment address with leave-at-door handoff
  const ctok = await apiLogin('customer', PHONES.customer);
  await fetch(`${API}/api/addresses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ctok }, body: JSON.stringify({ label: 'Home', line: 'Sunrise Residency', building: 'Sunrise Residency', tower: 'B', flat: 'B-304', landmark: 'blue gate after the bus stop', handoff: 'leave_at_door', lat: 12.9135, lng: 77.6420, makeDefault: true }) });

  const customer = await signIn(browser, 'customer', PHONES.customer, { gps: true });
  const partner = await signIn(browser, 'partner', PHONES.partner);
  await goOnline(partner);

  // GPS: use my current location, then switch back to the saved apartment address
  await customer.getByRole('button', { name: 'Change delivery address' }).click();
  await customer.getByText('Use my current location').click();
  await expect(customer.getByText('Delivering to your current location').first()).toBeVisible();
  await expect(customer.getByText(/Current location/).first()).toBeVisible();
  await shot(customer, '30-customer-gps-location');
  await customer.addStyleTag({ content: '.toast-stack{display:none}' }); // toasts overlay the header; keep them out of the way
  await customer.getByRole('button', { name: 'Change delivery address' }).click();
  await customer.locator('.sheet').getByText(/B-304/).first().click();
  await expect(customer.locator('.chrome').getByText(/Sunrise Residency/).first()).toBeVisible();

  // order paid in crypto
  await customer.getByPlaceholder('e.g. 2 kg onions').fill('Ghee 1 kg');
  await customer.getByRole('button', { name: 'Start list' }).click();
  await customer.getByRole('button', { name: /Continue · 1 item/ }).click();
  await customer.getByText('Crypto (USDT / USDC)').click();
  await shot(customer, '31-customer-checkout-crypto');
  await customer.getByRole('button', { name: 'Send to partners nearby' }).click();
  await expect(partner.getByText('New request nearby', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(partner.getByText(/B-304/).first()).toBeVisible();
  await partner.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await partner.getByRole('button', { name: /Reached/ }).click();
  await partner.getByLabel('What you paid for the items (₹)').fill('620');
  await partner.getByRole('button', { name: /Items bought/ }).click();

  // invoice appears on the customer side; handover is blocked until paid
  await expect(customer.getByText('Pay with crypto').first()).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByText(/USDT/).first()).toBeVisible();
  await customer.waitForTimeout(4000); // let the simulated partner move so the vehicle marker has a heading
  await shot(customer, '32-customer-crypto-invoice-live-vehicle');
  await partner.getByRole('button', { name: 'Arrived', exact: true }).click();
  await expect(partner.getByText(/Waiting for the customer/).first()).toBeVisible();
  await shot(partner, '33-partner-waiting-for-crypto');
  await customer.getByRole('button', { name: 'Simulate payment' }).click();
  await expect(customer.getByText(/^check_circlePaid$|^Paid$/).first()).toBeVisible();
  await expect(partner.getByText(/Take a photo of the delivery at the door|Leave at the door/).first()).toBeVisible();

  // leave at the door: proof photo instead of a code
  await partner.locator('input[type=file]').last().setInputFiles(PNG);
  await expect(partner.getByText('Photo taken · retake').first()).toBeVisible();
  await shot(partner, '34-partner-leave-at-door-photo');
  await partner.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(partner.getByText(/you earned/).first()).toBeVisible();
  await expect(customer.getByText(/Left at the door · photo by/).first()).toBeVisible();
  await expect(customer.getByText(/USDT paid|paid/).first()).toBeVisible();
  await shot(customer, '35-customer-delivered-at-door');
});
