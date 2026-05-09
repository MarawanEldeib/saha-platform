import { test, expect } from "@playwright/test";

// SAH-98 smoke harness — proves the test infra works end-to-end. Stripe
// test-mode + auth flows are deferred until staging exists (SAH-100). The
// harness itself is what lets a future ticket add those tests in 5 lines
// instead of half a day of bootstrap.

test("home page loads and shows the Find Courts CTA", async ({ page }) => {
    await page.goto("/en");
    // Accept cookies banner if it appears.
    const accept = page.getByRole("button", { name: /accept/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();
    // Hero CTA from messages/en.json → home.hero.cta_primary
    await expect(page.getByRole("link", { name: /find courts/i }).first()).toBeVisible();
});

test("map page renders with the search box", async ({ page }) => {
    await page.goto("/en/map");
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible({ timeout: 10_000 });
});

test("Arabic locale loads the home page", async ({ page }) => {
    await page.goto("/ar");
    // dir attribute on <html> should be rtl
    const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
    expect(dir).toBe("rtl");
});
