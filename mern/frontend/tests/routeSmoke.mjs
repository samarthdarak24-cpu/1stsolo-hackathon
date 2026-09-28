/**
 * Browser route smoke test.
 *
 * Why this exists: the staff/organization routing rules are pure front-end
 * guards (RequireAuth + canAccessOrg), so no API test can see them. The failure
 * they prevent is specific and ugly - a staff account being dropped on the
 * student dashboard and concluding the portal is broken - and it is invisible
 * from Node.
 *
 * It drives the REAL login form against the running dev server, so what it
 * checks is what a person sees. Run it with the backend (:5000) and the frontend
 * (:5173) already up:
 *
 *   node tests/routeSmoke.mjs
 *
 * Exit code 0 only when every route lands where it should. It needs the backend
 * and the frontend dev server already running; it never starts one itself.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.SMOKE_PASSWORD || 'lostlink123';
const STAFF = process.env.SMOKE_STAFF || 'staff@abcschool.com';
const STUDENT = process.env.SMOKE_STUDENT || 'student@abcschool.com';
const ADMIN = process.env.SMOKE_ADMIN || 'admin@abcschool.com';
const TIMEOUT = 20000;

/** The consolidated section a staff member must reach, and a manager-only one. */
const STAFF_ALLOWED = '/organization/recovery';
const ADMIN_ONLY = '/organization/insights';
const STAFF_HOME = '/organization/overview';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

/** Fills the first selector that exists, so a restyle cannot break the test. */
async function fill(page, selectors, value) {
  for (const selector of selectors) {
    const field = page.locator(selector).first();
    if (await field.count()) {
      // The SPA renders the form after hydration, so "the element exists" is not
      // the same as "the element is ready to accept input".
      await field.waitFor({ state: 'visible', timeout: TIMEOUT });
      await field.fill(value);
      return selector;
    }
  }
  throw new Error(`none of these inputs exist: ${selectors.join(', ')}`);
}

async function click(page, selectors) {
  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (await button.count()) {
      await button.waitFor({ state: 'visible', timeout: TIMEOUT });
      await button.click();
      return selector;
    }
  }
  throw new Error(`none of these controls exist: ${selectors.join(', ')}`);
}

const hashOf = (page) => page.evaluate(() => window.location.hash.replace(/^#/, '') || '/');

/**
 * Logs in through the real UI.
 *
 * /login opens on a dashboard chooser first (it is the landing screen for a
 * signed-out visitor), so the sign-in form is only shown after the visitor says
 * which dashboard they want - the form itself is never reachable directly.
 */
async function login(page, email, choice) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'load' });
  const chooser = page.getByRole('button', { name: new RegExp(choice, 'i') }).first();
  await chooser.waitFor({ state: 'visible', timeout: TIMEOUT });
  await chooser.click();
  await fill(page, ['#email', 'input[name="email"]', 'input[type="email"]'], email);
  await fill(page, ['#password', 'input[name="password"]', 'input[type="password"]'], PASSWORD);
  await click(page, ['button[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Log in")']);
  await page.waitForFunction(() => !window.location.hash.includes('/login'), null, { timeout: TIMEOUT });
  // Let the auth context settle before reading the guards' decision.
  await page.waitForTimeout(600);
}

async function visit(page, path) {
  await page.goto(`${BASE}/#${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return hashOf(page);
}

const browser = await chromium.launch();

try {
  /* ---- staff session ------------------------------------------------ */
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();

  await login(staff, STAFF, 'Organization Dashboard');
  const staffLanding = await hashOf(staff);
  check(
    `${STAFF} lands on the organization overview`,
    staffLanding === STAFF_HOME,
    `landed on ${staffLanding}`
  );

  const allowed = await visit(staff, STAFF_ALLOWED);
  check(
    `staff can open ${STAFF_ALLOWED}`,
    allowed.startsWith(STAFF_ALLOWED),
    `ended on ${allowed}`
  );

  const blocked = await visit(staff, ADMIN_ONLY);
  check(
    `staff is sent back from manager-only ${ADMIN_ONLY}`,
    blocked === STAFF_HOME,
    `ended on ${blocked}`
  );

  /* ---- the consolidation itself ------------------------------------- */
  // The point of the pivot: one destination per job, and the URLs that used to
  // be separate features still arrive somewhere sensible instead of 404ing.
  const legacyReports = await visit(staff, '/organization/lost-found');
  check(
    'old /organization/lost-found opens the Recovery Queue',
    legacyReports === '/organization/recovery?tab=reports',
    `ended on ${legacyReports}`
  );

  // A staff account may not read the audit log, so the legacy URL lands them
  // back on the overview - the same place the sidebar entry would have sent
  // them. The tab mapping itself is asserted against an admin below.
  const legacyAudit = await visit(staff, '/organization/audit-logs');
  check(
    'old /organization/audit-logs sends a non-manager back to the overview',
    legacyAudit === STAFF_HOME,
    `ended on ${legacyAudit}`
  );

  // Exactly six destinations, as designed: the whole point of the pivot.
  const orgNavCount = await staff.locator('aside nav a').count();
  check(
    'the organization sidebar holds 6 destinations',
    orgNavCount === 6,
    `found ${orgNavCount}`
  );

  /* ---- admin session ------------------------------------------------ */
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, ADMIN, 'Organization Dashboard');

  const adminInsights = await visit(admin, '/organization/insights');
  const insightsTabs = await admin.getByRole('tab', { name: /AI Models/i }).count();
  check(
    'a manager can open Insights and reach the AI model inventory',
    adminInsights === '/organization/insights' && insightsTabs === 1,
    `ended on ${adminInsights}, model tab count ${insightsTabs}`
  );

  const adminAudit = await visit(admin, '/organization/audit-logs');
  check(
    'old /organization/audit-logs redirects into Insights on the audit tab',
    adminAudit === '/organization/insights?tab=audit',
    `ended on ${adminAudit}`
  );

  /* ---- student session --------------------------------------------- */
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();

  await login(student, STUDENT, 'User Dashboard');
  const studentLanding = await hashOf(student);
  check(
    `${STUDENT} lands on the user dashboard`,
    studentLanding === '/dashboard',
    `landed on ${studentLanding}`
  );

  const bounced = await visit(student, '/organization/overview');
  check(
    'a student is sent back from the organization portal',
    bounced === '/dashboard',
    `ended on ${bounced}`
  );

  const legacyType = await visit(student, '/report-lost');
  check(
    'old /report-lost opens the unified Report page on the lost form',
    legacyType === '/report?type=lost',
    `ended on ${legacyType}`
  );

  const recoveryTab = await visit(student, '/my-reports');
  check(
    'old /my-reports opens Recovery on the cases tab',
    recoveryTab === '/recovery?tab=cases',
    `ended on ${recoveryTab}`
  );

  await visit(student, '/dashboard');
  const userNavCount = await student.locator('aside nav a').count();
  check(
    'the member sidebar holds 5 destinations',
    userNavCount === 5,
    `found ${userNavCount}`
  );

  /* ---- anonymous ---------------------------------------------------- */
  const anonContext = await browser.newContext();
  const anon = await anonContext.newPage();
  const anonLanding = await visit(anon, '/recovery');
  check(
    'a signed-out visitor is sent to /login',
    anonLanding === '/login',
    `ended on ${anonLanding}`
  );
} finally {
  await browser.close();
}

let failed = 0;
for (const { name, ok, detail } of results) {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}
console.log(failed ? `\n${failed} route check(s) failed.` : `\n${results.length} route check(s) passed.`);
process.exit(failed ? 1 : 0);
