import { expect } from "bun:test";
import type { Page } from "playwright";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";

export type HostedSite = Readonly<{
    id: string;
    origin: string;
    administrator: { email: string; password: string };
}>;
export async function signInForSetup(page: Page, site: Omit<HostedSite, "id">) {
    await page.goto(`${site.origin}/.cms/setup`);
    await page.getByLabel("Email address").fill(site.administrator.email);
    await page.getByLabel("Password", { exact: true }).fill(site.administrator.password);
    await page.getByRole("button", { name: "Continue", exact: false }).click();
}
export async function selectEmptySite(page: Page) {
    await page.getByRole("button", { name: "Start from scratch", exact: false }).click({ timeout: 120_000 });
    await page.getByRole("button", { name: "Create an empty site", exact: false }).click();
    await page.getByRole("heading", { name: "Your workspace is ready." }).waitFor({ timeout: 60_000 });
}
export async function assertEmptySite(site: Omit<HostedSite, "id">) {
    const api = repositoryApi(site.origin);
    const actor = await api.session(site.administrator.email, site.administrator.password);
    const collections = await api.request(
        "ulvia/cms.installations",
        "/list-collection-installations",
        "GET",
        undefined,
        actor,
    );
    expect(collections.status).toBe(200);
    expect((await collections.json()).items).toEqual([]);
    const pages = await api.request("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 }, actor);
    expect(pages.status).toBe(200);
    expect((await pages.json()).items).toEqual([]);
    const home = await fetch(site.origin, { redirect: "manual" });
    expect(home.status).toBe(404);
    await home.body?.cancel();
    return { api, actor };
}
