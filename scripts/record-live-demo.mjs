import { chromium } from 'playwright';
import fs from 'fs';

const outDir = '/workspace/out/recordings';
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) fs.unlinkSync(`${outDir}/${f}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1920,1080'],
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: outDir, size: { width: 1920, height: 1080 } },
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

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 60000 });
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
const dest = `${outDir}/live-app-flow.webm`;
fs.renameSync(videoPath, dest);
console.log('VIDEO', dest, fs.statSync(dest).size);
