// tests/e2e/flows.spec.js — end-to-end coverage for the 8 v1 critical flows.
//
// These tests run against `npm run dev` (Pyodide proxied from CDN) or any
// origin set via PLAYWRIGHT_BASE_URL (e.g., the Docker container). A cold
// load including Pyodide can take 5-15s; per-test timeout is 60s.

import { test, expect } from '@playwright/test';

test.describe('while.hassiba.cc — v1 critical flows', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the engine-loading status to be replaced by an actual result.
    await expect(page.locator('#result-pane')).not.toContainText('Engine loading', {
      timeout: 60_000,
    });
  });

  test('F1: paste-and-trace happy path', async ({ page }) => {
    // The starter program is sum 1..n with n=10; the initial run should already
    // show a trace. Assert it contains the formal arrow.
    await expect(page.locator('#result-pane pre.trace')).toContainText('⇒');
    await expect(page.locator('#result-pane pre.trace')).toContainText('result');
  });

  test('F2: click "Try sum" example button → trace renders', async ({ page }) => {
    await page.click('[data-example="sum"]');
    await expect(page.locator('#result-pane pre.trace')).toContainText('⇒', { timeout: 15_000 });
  });

  test('F3: switch tool: trace → count', async ({ page }) => {
    await page.click('[data-tool="count"]');
    await expect(page.locator('#result-pane .count-result')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#result-pane .number')).toContainText(/^\d+$/);
  });

  test('F4: switch to hoare; enter pre/post; verify', async ({ page }) => {
    await page.click('[data-tool="hoare"]');
    await page.fill('#hoare-pre', 'n >= 0');
    await page.fill('#hoare-post', 'result == n*(n+1)//2');
    await page.fill('#hoare-samples', '{"n":[0,30]}');
    // Re-run by clicking the hoare tool again (or the Run button).
    await page.click('#run-btn');
    await expect(page.locator('#result-pane table.hoare')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#result-pane table.hoare')).toContainText('Verified');
  });

  test('F5: shared URL roundtrip', async ({ page, context }) => {
    // Click share on the default starter; grab the URL from the clipboard
    // via the toast (we surface the URL in the toast when clipboard is unavail).
    await page.evaluate(() => {
      // disable clipboard so the toast falls back to surfacing the URL
      navigator.clipboard = undefined;
    });
    await page.click('#share-btn');
    const toastText = await page.locator('#toast').textContent({ timeout: 5_000 });
    expect(toastText).toContain('#code=');

    // Open the URL in a new context.
    const url = toastText.trim();
    const newPage = await context.newPage();
    await newPage.goto(url);
    await expect(newPage.locator('#result-pane')).not.toContainText('Engine loading', {
      timeout: 60_000,
    });
    await expect(newPage.locator('#result-pane pre.trace')).toContainText('⇒');
  });

  test('F6: embed mode hides chrome', async ({ page }) => {
    await page.goto('/?embed=1');
    await expect(page.locator('body.embed')).toBeVisible();
    await expect(page.locator('.page-header')).toBeHidden();
    await expect(page.locator('.page-footer')).toBeHidden();
    await expect(page.locator('#share-btn')).toBeHidden();
  });

  test('F7: infinite-loop guardrail', async ({ page }) => {
    await page.fill('#editor', 'while tt do (skip)');
    await page.click('#run-btn');
    // Either the budget error pane appears, or the trace shows the truncation marker.
    await expect.poll(async () => {
      const errVisible = await page.locator('.error-block.kind-budget').isVisible().catch(() => false);
      const traceContent = await page.locator('#result-pane pre.trace').textContent().catch(() => '');
      return errVisible || /step budget exceeded/i.test(traceContent || '');
    }, { timeout: 30_000 }).toBeTruthy();
    // Page is still responsive.
    await expect(page.locator('#editor')).toBeEditable();
  });

  test('F8: syntax error', async ({ page }) => {
    await page.fill('#editor', 'x = 1');  // = instead of := — invalid in While
    await page.click('#run-btn');
    await expect(page.locator('.error-block.kind-syntax')).toBeVisible({ timeout: 30_000 });
  });

});
