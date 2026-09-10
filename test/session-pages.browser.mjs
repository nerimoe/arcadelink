// Run against `bun run dev`: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/session-pages.browser.mjs
// All API calls are intercepted; no accounts or machines are touched.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const origin = process.env.PREVIEW_ORIGIN || 'http://localhost:5173';
const output = process.env.SCREENSHOT_DIR || '/tmp/arcadelink-session-pages';
mkdirSync(output, { recursive: true });
const machine = { publicId: 'preview', name: '舞萌', shop: { name: '测试店铺', latitude: 35, longitude: 139, radiusMeters: 80 } };
const cards = [{ id: 'card', label: '红黑卡', accessCode: '6958' }];
let releaseMachine;
let gate = new Promise(resolve => { releaseMachine = resolve; });
let machineFailure = true;
let cardsFailure = true;
let loginResult = '请到店再进行登录';
let signedIn = true;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(resolve) { resolve({ coords: { latitude: 35, longitude: 139, accuracy: 10 } }); } } });
});
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let body = {};
  if (path === '/api/me') body = { user: signedIn ? { id: 'preview', displayName: '预览用户', role: 'user' } : null };
  else if (path === '/api/machines/session') {
    const fail = machineFailure;
    await gate;
    if (fail) return route.abort('failed');
    body = { machine };
  } else if (path === '/api/cards') {
    if (cardsFailure) return route.abort('failed');
    body = { cards };
  } else if (path === '/api/machines/login') {
    return route.fulfill({ status: loginResult ? 400 : 200, json: loginResult ? { error: loginResult } : { ok: true } });
  } else throw new Error(`Unexpected API request: ${path}`);
  await route.fulfill({ json: body });
});
async function noSession() {
  assert.equal(await page.locator('.machine-hero, .credential-list, .session-task-row').count(), 0);
}
async function shot(name) { await page.screenshot({ path: `${output}/web-${name}.png`, fullPage: true }); }
try {
  await page.goto(`${origin}/m?ticket=preview`);
  await page.getByRole('status', { name: '正在加载', exact: true }).waitFor();
  await noSession();
  assert.equal(await page.locator('.session-skeleton').count(), 0);
  await shot('loading');
  releaseMachine();
  await page.getByRole('heading', { name: '无法进入机台会话' }).waitFor();
  assert.equal(await page.getByText('网络连接失败，请检查网络后重试').count(), 1);
  await noSession();
  await shot('failed');
  machineFailure = false;
  gate = new Promise(resolve => { releaseMachine = resolve; });
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await page.getByRole('status', { name: '正在加载', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '重试', exact: true }).count(), 0);
  releaseMachine();
  await page.getByRole('heading', { name: '无法加载卡片' }).waitFor();
  assert.equal(await page.getByText('还没有可用卡片', { exact: false }).count(), 0);
  await shot('cards-failed');
  cardsFailure = false;
  await page.getByRole('button', { name: '重新加载卡片' }).click();
  await page.getByRole('button', { name: /红黑卡/ }).waitFor();
  const dialogShown = new Promise(resolve => page.once('dialog', async dialog => {
    assert.equal(dialog.type(), 'alert');
    assert.equal(dialog.message(), loginResult);
    await dialog.dismiss();
    resolve();
  }));
  await page.getByRole('button', { name: /红黑卡/ }).click();
  await dialogShown;
  await page.getByRole('button', { name: /红黑卡/ }).waitFor();
  loginResult = '本次会话已失效';
  await page.getByRole('button', { name: /红黑卡/ }).click();
  await page.waitForURL('**/m/expired');
  await page.getByRole('heading', { name: '本次会话已失效' }).waitFor();
  await noSession();
  await shot('expired');
  loginResult = null;
  await page.goto(`${origin}/m?ticket=new-session`);
  await page.getByRole('button', { name: /红黑卡/ }).click();
  await page.getByRole('heading', { name: '本次登录已完成' }).waitFor();
  await noSession();
  await shot('completed');
  await page.reload();
  await page.getByRole('heading', { name: '本次会话已失效' }).waitFor();
  signedIn = false;
  await page.goto(`${origin}/m?ticket=auth`);
  await page.getByRole('button', { name: '使用 MuNET 登录' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '登录 ArcadeLink' }).count(), 0);
  await shot('auth');
  assert.deepEqual(errors, []);
  console.log('PASS: loading → failure → retry → cards failure → cards → alert → expired; success → completed; signed out.');
} finally {
  await browser.close();
}
