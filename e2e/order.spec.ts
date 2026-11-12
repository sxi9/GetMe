// One live order across the three apps, driven entirely through the UI.
import { test, expect, type Page, type Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = join(import.meta.dirname, 'screenshots');
mkdirSync(SHOTS, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, name + '.png') });

async function signIn(browser: Browser, role: 'customer' | 'partner' | 'shop'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => { throw e; });
  await page.goto(`/${role}`);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('One-time code').fill('1234');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  return page;
}

test('list order: customer → partner → handover → rating; shop order: catalogue → shop prep → delivery', async ({ browser }) => {
  const customer = await signIn(browser, 'customer');
  const partner = await signIn(browser, 'partner');
  const shop = await signIn(browser, 'shop');

  // partner goes online (no GPS in the test browser → simulated position)
  await expect(partner.getByText('You are offline', { exact: true })).toBeVisible();
  await partner.locator('label:has(input[role=switch])').first().click();
  await expect(partner.getByText('You are online', { exact: true })).toBeVisible();

  // ---- customer builds a list and broadcasts it
  await expect(customer.getByText('Shops nearby')).toBeVisible();
  await customer.getByPlaceholder('e.g. 2 kg onions').fill('Tomatoes 1 kg');
  await customer.getByRole('button', { name: 'Start list' }).click();
  await customer.getByPlaceholder('Add an item, e.g. Tomatoes 1 kg').fill('Milk 500 ml');
  await customer.getByPlaceholder('Add an item, e.g. Tomatoes 1 kg').press('Enter');
  await customer.getByRole('button', { name: /Continue · 2 items/ }).click();
  await expect(customer.getByText('How should we find a partner?')).toBeVisible();
  await shot(customer, '01-customer-checkout');
  await customer.getByPlaceholder('Promo code').fill('GETME20');
  await customer.getByRole('button', { name: 'Apply' }).click();
  await expect(customer.getByText('₹20 off delivery applied')).toBeVisible();
  await customer.getByRole('button', { name: 'Send to partners nearby' }).click();
  await expect(customer.getByText(/Request sent to partners|Seen by/).first()).toBeVisible();

  // ---- partner accepts and runs the job
  await expect(partner.getByText('New request nearby', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(partner.getByText('Tomatoes 1 kg').first()).toBeVisible();
  await shot(partner, '02-partner-request'); await shot(customer, '03-customer-finding');
  await partner.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(partner.getByText('Handover').first()).toBeVisible();
  await expect(customer.getByText('Ravi Kumar').first()).toBeVisible();
  await expect(customer.getByText('Heading to the shop').first()).toBeVisible();
  await partner.getByRole('button', { name: /Reached/ }).click();
  await expect(customer.getByText('Buying your items').first()).toBeVisible();
  await shot(partner, '04-partner-shopping');
  await partner.getByLabel('What you paid for the items (₹)').fill('95');
  await partner.getByRole('button', { name: /Items bought/ }).click();
  await expect(customer.getByText('Handover code').first()).toBeVisible();
  await shot(customer, '05-customer-tracking');
  const otp = (await customer.locator('.mono', { hasText: /^\d{4}$/ }).first().textContent())!.trim();
  expect(otp).toMatch(/^\d{4}$/);
  await partner.getByRole('button', { name: 'Arrived', exact: true }).click();
  await expect(customer.getByText(/arrived/i).first()).toBeVisible();
  await partner.getByLabel('Handover code').fill('0000');
  await partner.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(partner.getByText(/Code does not match/).first()).toBeVisible();
  await shot(partner, '06-partner-handover');
  await partner.getByLabel('Handover code').fill(otp);
  await partner.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(partner.getByText(/you earned/).first()).toBeVisible();
  await partner.getByRole('button', { name: /Submit/ }).click();

  // ---- customer tips and rates
  await expect(customer.getByText(/Delivered by Ravi/).first()).toBeVisible();
  await shot(customer, '07-customer-delivered');
  await customer.getByText('₹20', { exact: true }).first().click();
  await customer.getByText('On time').click();
  await customer.getByRole('button', { name: 'Submit rating' }).click();
  await expect(customer.getByText('Shops nearby')).toBeVisible();
  await customer.getByRole('button', { name: 'Orders' }).click();
  await expect(customer.getByText('Delivered').first()).toBeVisible();
  await expect(customer.getByText(/₹1[0-9]{2}/).first()).toBeVisible(); // 95 + 45 + 5 − 20 + 20 tip = 145

  // ---- shop catalogue order, COD
  await customer.getByRole('button', { name: 'Home' }).click();
  await customer.getByText("Nandini's Fresh Mart").first().click();
  await expect(customer.getByText('Tomato', { exact: true }).first()).toBeVisible();
  await customer.getByRole('button', { name: 'Add' }).first().click();
  await customer.getByRole('button', { name: 'Checkout' }).click();
  await customer.getByText('Cash on delivery').click();
  await customer.getByRole('button', { name: 'Send to partners nearby' }).click();
  await expect(shop.getByText('Accept order').first()).toBeVisible({ timeout: 20_000 });
  await shot(shop, '08-shop-new-order');
  await shop.getByRole('button', { name: 'Accept order' }).first().click();
  await shop.getByRole('button', { name: 'Mark ready' }).first().click();
  await expect(shop.getByText('Ready for pickup').first()).toBeVisible();
  await expect(partner.getByText('New request nearby', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await partner.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await partner.getByRole('button', { name: /Reached/ }).click();
  await shop.getByRole('button', { name: 'Handed to partner' }).first().click();
  await expect(shop.getByText('With partner').first()).toBeVisible();
  await partner.getByRole('button', { name: /start delivery/ }).click();
  await partner.getByRole('button', { name: 'Arrived', exact: true }).click();
  const otp2 = (await customer.locator('.mono', { hasText: /^\d{4}$/ }).first().textContent())!.trim();
  await partner.getByLabel('Handover code').fill(otp2);
  await partner.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(partner.getByText(/Confirm the cash collected/).first()).toBeVisible();
  await partner.locator('label:has(input[type=checkbox]:not([role]))').first().click();
  await partner.getByRole('button', { name: 'Complete delivery' }).click();
  await expect(partner.getByText(/you earned/).first()).toBeVisible();
  await expect(shop.getByText('Completed').first()).toBeVisible();
  await partner.getByRole('button', { name: /Submit/ }).click();
  await partner.getByRole('button', { name: 'Earnings' }).click();
  await expect(partner.getByText(/2 trips · ₹20 in tips/).first()).toBeVisible();
  await shot(partner, '09-partner-earnings');
  await shop.getByRole('tab', { name: 'Analytics' }).click(); await shot(shop, '10-shop-analytics');
  await customer.getByRole('button', { name: 'Submit rating' }).click();
  await customer.getByRole('button', { name: 'Profile' }).click(); await shot(customer, '11-customer-profile');
});
