import { chromium } from 'playwright';
import fs from 'fs';

const outDir = '/workspace/out/recordings';
fs.mkdirSync(outDir, { recursive: true });

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

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle', timeout: 60000 });
await page.getByPlaceholder(/Invoice Northwind/i).waitFor({ timeout: 30000 });
await sleep(2500);

// Prefer typing (clearer than chip) — no secrets on screen
const input = page.getByPlaceholder(/Invoice Northwind/i);
await input.click();
await sleep(500);
const prompt =
  'Invoice Acme Sandbox LLC at buyer-sandbox@example.com $500 for logo design, due in 14 days';
await input.fill(prompt);
await sleep(1500);
await page.getByRole('button', { name: /^Send$/ }).click();

// Wait for human confirmation card
await page.getByText(/Human confirmation required/i).waitFor({ timeout: 120000 });
await sleep(2500);
await page.getByRole('button', { name: /^Confirm$/ }).click();

await page.getByText(/Sent|local desk|INV-/i).first().waitFor({ timeout: 60000 });
await sleep(2500);

await page.getByRole('button', { name: /Refresh/i }).click();
await sleep(2500);

await input.click();
await input.fill('List my unpaid invoices');
await sleep(800);
await page.getByRole('button', { name: /^Send$/ }).click();
await sleep(10000);

await page.mouse.wheel(0, 300);
await sleep(2000);

const video = page.video();
await context.close();
await browser.close();
const videoPath = await video.path();
const dest = `${outDir}/live-app-flow.webm`;
fs.renameSync(videoPath, dest);
console.log('VIDEO', dest, fs.statSync(dest).size);
