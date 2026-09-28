const { chromium } = require('playwright');
const fs = require('fs');

const OUT = 'shots';
const BASE = 'http://localhost:5173';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

async function login(page, email, which) {
  // /login opens a "which dashboard?" choice screen first, then the real form.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.getByText(which, { exact: false }).first().click();
  await page.waitForSelector('input[type=email]', { timeout: 20000 });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'lostlink123');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForTimeout(5500);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---- desktop, member -------------------------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(`PAGEERROR ${e.message}`));

  await login(page, 'student@abcschool.com', 'User Dashboard');
  await page.screenshot({ path: `${OUT}/01-user-dashboard.png` });

  for (const [r, name] of [
    ['/ai-matches', '02-ai-matches'],
    ['/my-reports', '03-my-reports'],
    ['/notifications', '04-notifications'],
    ['/track-return', '05-track-return'],
    ['/profile', '06-profile']
  ]) {
    await page.goto(`${BASE}/#${r}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }

  // ---- desktop, organization ------------------------------------------
  const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const op = await octx.newPage();
  op.on('pageerror', e => errors.push(`ORG PAGEERROR ${e.message}`));
  await login(op, 'admin@abcschool.com', 'Organization Dashboard');
  await op.screenshot({ path: `${OUT}/07-org-overview.png` });

  for (const [r, name] of [
    ['/organization/lost-found', '08-org-lostfound'],
    ['/organization/ai-matching', '09-org-aimatching'],
    ['/organization/verification', '10-org-verification'],
    ['/organization/analytics', '11-org-analytics'],
    ['/organization/audit-logs', '12-org-audit'],
    ['/organization/items', '13-org-items']
  ]) {
    await op.goto(`${BASE}/#${r}`, { waitUntil: 'domcontentloaded' });
    await op.waitForTimeout(2500);
    await op.screenshot({ path: `${OUT}/${name}.png` });
  }

  // ---- mobile ----------------------------------------------------------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mctx.newPage();
  await login(mp, 'student@abcschool.com', 'User Dashboard');
  await mp.screenshot({ path: `${OUT}/14-mobile-dashboard.png` });

  console.log('ERRORS:', errors.length ? [...new Set(errors)].slice(0, 6).join(' || ') : 'none');
  await browser.close();
  console.log('SHOTS DONE');
})();


