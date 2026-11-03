import { expect } from "bun:test";
import { chromium } from "playwright";
import { join } from "node:path";
import type { sampleContract } from "./publication/resource";

/** Ordinary browser Pages use shared Access cookies and the admitted query/mutation runtime. */
export async function exerciseRepositoryWebsite(
    origin: string,
    root: string,
    sample: Awaited<ReturnType<typeof sampleContract>>,
) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const open = async (path: string) => {
        expect((await page.goto(`${origin}${path}`))?.status()).toBe(200);
        await page.evaluate(() => customElements.whenDefined("cms-binding-core"));
    };
    try {
        await open("/");
        expect(await page.getByRole("heading", { name: "Catalogue", exact: true }).count()).toBe(1);
        const coordinate = new URLSearchParams({
            "ulvia-repository-kind": "contract",
            "ulvia-repository-publisher": sample.namespace,
            "ulvia-repository-resource": sample.id,
            "ulvia-repository-version": sample.version,
        });
        await open(`/resource?${coordinate}`);
        await page.getByText(sample.digest, { exact: true }).waitFor();
        expect(await page.getByRole("heading", { name: "Greeting examples", exact: true }).count()).toBe(1);
        await open("/search");
        await page.getByLabel("Search resources", { exact: true }).fill("greeting");
        await page.getByRole("link", { name: "Greeting examples", exact: true }).first().waitFor();
        await open("/signup");
        await page.getByLabel("Email address", { exact: true }).fill("browser-publisher@example.test");
        await page.getByLabel("Password", { exact: true }).fill("Browser-publisher-long-password");
        await Promise.all([
            page.waitForURL(`${origin}/login`),
            page.getByRole("button", { name: "Create an account", exact: true }).click(),
        ]);
        await page.getByLabel("Email address", { exact: true }).fill("browser-publisher@example.test");
        await page.getByLabel("Password", { exact: true }).fill("Browser-publisher-long-password");
        await Promise.all([
            page.waitForURL(`${origin}/account`),
            page.getByRole("button", { name: "Sign in", exact: true }).click(),
        ]);
        await open("/account/namespaces");
        await page.getByLabel("Namespace", { exact: true }).fill("browser.publisher");
        await page.getByRole("button", { name: "Claim namespace", exact: true }).click();
        await page.getByText("browser.publisher", { exact: true }).waitFor();
        await open("/account/publications");
        await page.getByRole("link", { name: "browser.publisher", exact: true }).waitFor();
        await open("/account/tokens");
        await page.getByLabel("Name", { exact: true }).fill("Browser publication");
        await page.getByRole("button", { name: "Create token", exact: true }).click();
        await page.locator("code").waitFor();
        const secret = await page.locator("code").innerText();
        expect(secret.length).toBeGreaterThan(32);
        const protectedUrl = `${origin}/.cms/call/ulvia.repository/v1/namespaces`;
        expect((await fetch(protectedUrl, { headers: { authorization: `Bearer ${secret}` } })).status).toBe(200);
        await open("/account/tokens");
        expect(await page.locator("code").count()).toBe(0);
        await page.getByRole("button", { name: "Revoke", exact: true }).click();
        await page.getByText("Browser publication", { exact: true }).waitFor({ state: "detached" });
        expect((await fetch(protectedUrl, { headers: { authorization: `Bearer ${secret}` } })).status).toBe(401);
        await open("/account");
        await Promise.all([
            page.waitForURL(`${origin}/login`),
            page.getByRole("button", { name: "Sign out", exact: true }).click(),
        ]);
        for (const width of [375, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            await open("/");
            expect(await page.locator("main").count()).toBe(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: join(root, `repository-home-${width}.png`), fullPage: true });
        }
        expect(errors).toEqual([]);
    } finally {
        await browser.close();
    }
}
