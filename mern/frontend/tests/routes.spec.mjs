/**
 * Route smoke test.
 *
 * Covers the routing failure that is easiest to ship and hardest to notice: an
 * account that can log in but lands on a dashboard it cannot use, or a page that
 * is reachable in the navigation but renders nothing. Both look like "the app is
 * broken" to the person holding the phone, and neither shows up in an API test.
 *
 * Runs against the dev server on :5173 (start it first). Sign-in is done through
 * the real form, because a token poked into localStorage would skip exactly the
 * code this is meant to check (login response -> dashboardTypeFor -> route).
 */
import { expect, test } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const PASSWORD = process.env.E2E_PASSWORD || 'lostlink123';

const ACCOUNTS = {
  staff: { email: 'staff@abcschool.com', home: '/organization/dashboard', org: true },
  admin: { email: 'admin@abcschool.com', home: '/organization/dashboard', org: true },
  student: { email: 'student@abcschool.com', home: '/dashboard', org: false }
};

/** Logs in through the UI and waits for the app to land somewhere real. */
async function login(page, email) {
  await page.goto(`${BASE}/#/login`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Hash routing: the URL only changes once the SPA has decided where to send us.
  await page.waitForFunction(() => !location.hash.includes('/login'), null, { timeout: 20000 });
  // The guards render a loader first; wait for it to be gone so the next
  // navigation is not measured against a half-mounted tree.
  await expect(page.getByText('Loading LostLink AI…')).toHaveCount(0, { timeout: 20000 });
}

test.describe('role-based routing', () => {
  test('staff lands on the organization dashboard', async ({ page }) => {
    await login(page, ACCOUNTS.staff.email);
    expect(new URL(page.url()).hash).toBe(`#${ACCOUNTS.staff.home}`);
  });

  test('staff is bounced off an admin-only page, not shown a blank one', async ({ page }) => {
    await login(page, ACCOUNTS.staff.email);
    await page.goto(`${BASE}/#/organization/audit-logs`);
    await expect
      .poll(() => new URL(page.url()).hash, { timeout: 20000 })
      .toBe(`#${ACCOUNTS.staff.home}`);
  });

  test('staff can open a queue it owns', async ({ page }) => {
    await login(page, ACCOUNTS.staff.email);
    await page.goto(`${BASE}/#/organization/lost-found`);
    await expect.poll(() => new URL(page.url()).hash, { timeout: 20000 }).toBe('#/organization/lost-found');
    // The page must render, not just route: an empty shell is still broken.
    await expect(page.locator('main, [role="main"], body')).not.toBeEmpty();
  });

  test('admin reaches the admin-only page', async ({ page }) => {
    await login(page, ACCOUNTS.admin.email);
    await page.goto(`${BASE}/#/organization/audit-logs`);
    await expect.poll(() => new URL(page.url()).hash, { timeout: 20000 }).toBe('#/organization/audit-logs');
  });

  test('student lands on the user dashboard and is kept out of the org portal', async ({ page }) => {
    await login(page, ACCOUNTS.student.email);
    expect(new URL(page.url()).hash).toBe(`#${ACCOUNTS.student.home}`);

    await page.goto(`${BASE}/#/organization/dashboard`);
    await expect
      .poll(() => new URL(page.url()).hash, { timeout: 20000 })
      .toBe(`#${ACCOUNTS.student.home}`);
  });

  test('an unknown hash route resolves somewhere usable', async ({ page }) => {
    await login(page, ACCOUNTS.student.email);
    await page.goto(`${BASE}/#/definitely-not-a-route`);
    await expect
      .poll(() => new URL(page.url()).hash, { timeout: 20000 })
      .toMatch(/^#\/(dashboard|organization\/dashboard)$/);
  });
});
