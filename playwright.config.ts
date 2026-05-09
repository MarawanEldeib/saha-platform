import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
    testDir: "./e2e",
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? "github" : "list",
    use: {
        baseURL,
        trace: "on-first-retry",
        // Mobile viewport by default — most of our traffic is phone.
        viewport: { width: 390, height: 844 },
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
    // Only auto-start the dev server locally; CI runs against a deployed URL.
    webServer: process.env.CI
        ? undefined
        : {
            command: "npm run dev",
            url: baseURL,
            reuseExistingServer: true,
            timeout: 120_000,
        },
});
