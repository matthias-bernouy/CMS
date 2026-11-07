import { expect, test } from "bun:test";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { scratchRepository } from "../containers/scratch";
import { docker } from "../docker";
import { repositoryApi } from "./client";
import { initializationApi } from "./initializationClient";
import { publishBundledReleases } from "./bootstrap";

const provider = process.env.ULVIA_SETUP_PROVIDER_DOCKER_IMAGE;
const edge = process.env.ULVIA_SETUP_EDGE_DOCKER_IMAGE;
const integration = provider && edge ? test : test.skip;
const screenshots = "/tmp/ulvia-setup-screens";

async function login(page: Page, site: { url: string; administrator: { email: string; password: string } }) {
    await page.goto(site.url);
    await page.waitForURL(`${site.url}/.cms/setup`);
    await page.getByLabel("Email address").fill(site.administrator.email);
    await page.getByLabel("Password", { exact: true }).fill(site.administrator.password);
    await page.getByRole("button", { name: "Continue", exact: false }).click();
    await page.getByRole("heading", { name: "Where would you like to start?" }).waitFor();
}

integration(
    "native setup authenticates, reviews and installs Mossa; an offline empty start stays empty after restart",
    async () => {
        const stack = await scratchRepository({ provider: provider!, edge: edge! });
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
        const scriptErrors: string[] = [];
        page.on("pageerror", (error) => scriptErrors.push(error.message));
        try {
            const api = repositoryApi(stack.url);
            const session = await api.session(stack.administrator.email, stack.administrator.password);
            const setup = initializationApi(stack.url, session.cookie);
            const empty = await setup.plan(null);
            await setup.apply(null, empty.digest);
            const pat = await api.pat(session.cookie);
            await publishBundledReleases(stack.url, "http://ulvia-provider:5103", pat.token);
            const site = await stack.createSite("starter");
            const siteApi = repositoryApi(site.url);
            const siteSession = await siteApi.session(site.administrator.email, site.administrator.password);
            const siteSetup = initializationApi(site.url, siteSession.cookie);
            const foreignReview = await siteSetup.plan(null);
            const anonymous = await initializationApi(site.url).call("initialization/status");
            expect([401, 403]).toContain(anonymous.status);
            await login(page, site);
            await mkdir(screenshots, { recursive: true });
            await page.screenshot({ path: `${screenshots}/choice.png`, fullPage: true });
            await page.setViewportSize({ width: 375, height: 812 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.screenshot({ path: `${screenshots}/choice-mobile.png`, fullPage: true });
            await page.setViewportSize({ width: 1360, height: 900 });
            await page.getByRole("button", { name: "Use a starter", exact: false }).click();
            await page.getByRole("button", { name: /^Administration / }).click();
            await page.getByRole("heading", { name: "Review your starting point." }).waitFor();
            await page.screenshot({ path: `${screenshots}/review.png`, fullPage: true });
            await page.getByRole("checkbox").check();
            await page.getByRole("button", { name: "Confirm and install", exact: false }).click();
            await page.getByRole("heading", { name: "Your workspace is ready." }).waitFor({ timeout: 120_000 });
            const pages = await siteApi.request(
                "ulvia/cms.content",
                "/pages/list",
                "QUERY",
                { limit: 100 },
                siteSession,
            );
            expect((await pages.json()).items.length).toBeGreaterThan(15);
            expect((await siteSetup.call("initialization/status").then((response) => response.json())).status).toBe(
                "completed",
            );
            await page.getByRole("link", { name: "Open your site", exact: false }).click();
            await page.waitForURL(`${site.url}/admin`);
            const blank = await stack.createSite("blank");
            const blankSession = await repositoryApi(blank.url).session(
                blank.administrator.email,
                blank.administrator.password,
            );
            const blankSetup = initializationApi(blank.url, blankSession.cookie);
            await blankSetup.apply(null, foreignReview.digest, "failed");
            expect((await blankSetup.call("initialization/status").then((response) => response.json())).status).toBe(
                "pending",
            );
            await docker(["stop", stack.edgeName]);
            await login(page, blank);
            await page.getByRole("button", { name: "Start from scratch", exact: false }).click();
            await page.getByRole("button", { name: "Create an empty site", exact: false }).click();
            await page.getByRole("heading", { name: "Your workspace is ready." }).waitFor({ timeout: 60_000 });
            const blankPages = await repositoryApi(blank.url).request(
                "ulvia/cms.content",
                "/pages/list",
                "QUERY",
                { limit: 25 },
                blankSession,
            );
            expect((await blankPages.json()).items).toEqual([]);
            expect((await fetch(blank.url, { redirect: "manual" })).status).toBe(404);
            await stack.restart();
            expect((await blankSetup.call("initialization/status").then((response) => response.json())).status).toBe(
                "completed",
            );
            expect((await fetch(blank.url, { redirect: "manual" })).status).toBe(404);
            expect(scriptErrors).toEqual([]);
        } catch (error) {
            await page.screenshot({ path: "/tmp/ulvia-setup-failure.png", fullPage: true }).catch(() => {});
            throw new Error(`${String(error)}\n${await stack.diagnostics()}`);
        } finally {
            await browser.close();
            await stack.close();
        }
    },
    300_000,
);
