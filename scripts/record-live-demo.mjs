// Records the live sandbox flow against a LOCAL dev server (live mode is loopback-only).
// Env: RECORD_OUT_DIR (default: <os tmp>/invoice-copilot-recordings), APP_URL (default http://localhost:3000/).
// Only touches files this script creates: a fresh mkdtemp scratch dir for Playwright's
// raw video and the single output file live-app-flow.webm.
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';
import path from 'path';

const outDir = path.resolve(process.env.RECORD_OUT_DIR || path.join(os.tmpdir(), 'invoice-copilot-recordings'));
const appUrl = process.env.APP_URL || 'http://localhost:3000/';
fs.mkdirSync(outDir, { recursive: true });
const dest = path.join(outDir, 'live-app-flow.webm');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'invoice-copilot-rec-'));

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1080'],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: scratch, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
const sleep = (ms) => page.waitForTimeout(ms);

async function setReactInput(locator, value) {
  await locator.click();
  await locator.evaluate((el, v) => {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    desc.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 60000 });
await page.getByText('Live LLM').waitFor({ timeout: 30000 });
await sleep(2500);

await page.locator('button', { hasText: 'Invoice Acme Sandbox' }).first().click();
await page.getByText(/Human confirmation required/i).waitFor({ timeout: 120000 });
await sleep(3000);
await page.getByRole('button', { name: /^Confirm$/ }).click();

await page.getByText(/on PayPal sandbox/i).first().waitFor({ timeout: 90000 });
await sleep(3000);

await page.getByRole('button', { name: /Refresh/i }).click();
await sleep(3000);

const input = page.getByPlaceholder(/Invoice Northwind/i);
await setReactInput(input, 'List my invoices and show their PayPal status');
await sleep(400);
await page.getByRole('button', { name: /^Send$/ }).click();
await sleep(12000);

await page.mouse.wheel(0, 350);
await sleep(2500);

const video = page.video();
await context.close();
await browser.close();
const videoPath = await video.path();
// Replace only our own previous output, then remove the (now empty) scratch dir.
fs.rmSync(dest, { force: true });
fs.copyFileSync(videoPath, dest);
fs.unlinkSync(videoPath);
fs.rmdirSync(scratch);
console.log('VIDEO', dest, fs.statSync(dest).size);
