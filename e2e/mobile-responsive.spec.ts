import { test, expect } from "@playwright/test";

// SAH-33 — Mobile-first audit at 375px. Loads each critical-path public
// page at iPhone-SE width and asserts:
//   1. No horizontal scroll (scrollWidth must equal clientWidth on <html>).
//   2. Every interactive element (button/a/input) has a tap target ≥ 40×40
//      (slightly under the WCAG 44 target — accounts for sub-pixel rounding
//      and decorative icon-only buttons that wrap a larger hit area via padding).
//
// Auth-gated routes (booking detail, account settings) cannot be hit
// without a real session — covered separately by SAH-98 once staging
// lands. This file targets routes a logged-out player can reach.

const VIEWPORT = { width: 375, height: 812 };

const PUBLIC_ROUTES: { path: string; name: string }[] = [
    { path: "/en", name: "home" },
    { path: "/en/map", name: "map" },
    { path: "/en/login", name: "login" },
    { path: "/en/register", name: "register" },
];

test.use({ viewport: VIEWPORT });

for (const { path, name } of PUBLIC_ROUTES) {
    test(`${name} — no horizontal scroll at 375px`, async ({ page }) => {
        await page.goto(path, { waitUntil: "networkidle" });
        // Dismiss the cookie banner if it's blocking layout measurement.
        const accept = page.getByRole("button", { name: /accept/i });
        if (await accept.isVisible().catch(() => false)) await accept.click();

        const overflow = await page.evaluate(() => {
            const html = document.documentElement;
            return {
                scrollWidth: html.scrollWidth,
                clientWidth: html.clientWidth,
                offenders: Array.from(document.body.querySelectorAll<HTMLElement>("*"))
                    .filter((el) => el.scrollWidth > html.clientWidth + 1)
                    .slice(0, 5)
                    .map((el) => ({
                        tag: el.tagName.toLowerCase(),
                        cls: el.className?.toString().slice(0, 120) ?? "",
                        w: el.scrollWidth,
                    })),
            };
        });

        expect(
            overflow.scrollWidth,
            `Horizontal scroll detected on ${name}. ` +
            `Top offenders: ${JSON.stringify(overflow.offenders, null, 2)}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test(`${name} — primary tap targets ≥ 40×40`, async ({ page }) => {
        await page.goto(path, { waitUntil: "networkidle" });
        const accept = page.getByRole("button", { name: /accept/i });
        if (await accept.isVisible().catch(() => false)) await accept.click();

        // Only enforce 40×40 on:
        //   - <button> elements (real actions)
        //   - <input type="text|email|tel|password|search|number"> (form fields)
        // Inline <a> links inside paragraphs are line-height bound and are
        // covered by typography rules, not tap-target rules. Checkboxes/radios
        // are intrinsically small; their <label> is the actual tap area.
        const tooSmall = await page.evaluate(() => {
            const isFormInput = (el: Element) => {
                if (el.tagName !== "INPUT") return false;
                const t = (el as HTMLInputElement).type;
                return ["text", "email", "tel", "password", "search", "number", "url"].includes(t);
            };
            const candidates = Array.from(document.querySelectorAll<HTMLElement>(
                "button, input"
            )).filter((el) => el.tagName === "BUTTON" || isFormInput(el));

            return candidates
                .filter((el) => {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return false; // hidden
                    if (el.closest("[data-allow-narrow-tap]")) return false;
                    // Form inputs only need height ≥ 40 (width is layout-driven)
                    if (el.tagName === "INPUT") return r.height < 40;
                    // Buttons need both
                    return r.width < 40 || r.height < 40;
                })
                .slice(0, 10)
                .map((el) => ({
                    tag: el.tagName.toLowerCase(),
                    type: (el as HTMLInputElement).type ?? "",
                    cls: el.className?.toString().slice(0, 100) ?? "",
                    text: el.textContent?.trim().slice(0, 30) ?? "",
                    w: Math.round(el.getBoundingClientRect().width),
                    h: Math.round(el.getBoundingClientRect().height),
                }));
        });

        expect(
            tooSmall,
            `Primary tap targets smaller than 40×40 on ${name}: ${JSON.stringify(tooSmall, null, 2)}`,
        ).toEqual([]);
    });
}
