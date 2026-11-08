import { expect } from "bun:test";
import type { Page } from "playwright";
import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";

const collectionId = "ulvia.test/smoke-kit";
const content =
    '<div cms-bloc="ulvia-dtest--smoke-kit--card"><h1 slot="content">Smoke Page</h1></div><div cms-bloc="ulvia-dtest--smoke-kit--card"><p slot="content">Explicit collection</p></div>';
type Credentials = { adminEmail: string; adminPassword: string };

async function session(origin: string, credentials: Credentials) {
    const api = repositoryApi(origin);
    const actor = await api.session(credentials.adminEmail, credentials.adminPassword);
    const call = async (contract: string, path: string, method = "GET", input?: unknown) => {
        const response = await api.request(contract, path, method, input, actor);
        expect(response.ok, `${path}: ${response.status} ${response.ok ? "" : await response.text()}`).toBe(true);
        return response.json();
    };
    return { api, actor, call };
}

export async function runEdgeSmoke(
    page: Page,
    credentials: Credentials,
    origin: string,
    repositoryUrl?: string,
): Promise<void> {
    await page.goto(`${origin}/.cms/setup`);
    await page.getByLabel("Email address").fill(credentials.adminEmail);
    await page.getByLabel("Password", { exact: true }).fill(credentials.adminPassword);
    await page.getByRole("button", { name: "Continue", exact: false }).click();
    await page.getByRole("button", { name: "A Repository address", exact: false }).click();
    await page.getByLabel("Repository address", { exact: true }).fill(repositoryUrl!);
    await page.getByRole("button", { name: "Use this Repository", exact: false }).click();
    await page.getByRole("button", { name: "Start from scratch", exact: false }).click();
    await page.getByRole("button", { name: "Create an empty site", exact: false }).click();
    await page.getByRole("heading", { name: "Your workspace is ready." }).waitFor({ timeout: 60_000 });
    const { api, call } = await session(origin, credentials);
    expect((await call("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 })).items).toEqual([]);
    const initial = await call("ulvia/cms.installations", "/list-collection-installations");
    expect(initial.items).toEqual([]);
    expect((await fetch(origin, { redirect: "manual" })).status).toBe(404);
    const refused = await api.request("ulvia/cms.content", "/pages/create", "POST", {
        path: "/refused",
        title: "Refused",
    });
    expect([401, 403]).toContain(refused.status);
    expect((await call("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 })).items).toEqual([]);
    const catalogue = await call("ulvia/cms.installations", "/collections/catalogue", "QUERY", { limit: 25 });
    expect(catalogue.releases.some((entry: { version: string }) => entry.version.includes("beta"))).toBe(false);
    const entry = catalogue.releases.find((entry: { collectionId: string }) => entry.collectionId === collectionId)!;
    const installed = await call("ulvia/cms.installations", "/install-collection", "POST", {
        expectedRevision: initial.revision,
        targets: [
            {
                repositoryId: entry.repositoryId,
                publisherId: entry.publisherId,
                collectionId,
                version: entry.version,
                digest: entry.digest,
                approvedBrowserRiskDigest: entry.browserRiskDigest,
            },
        ],
    });
    expect(installed.items.map((item: { collectionId: string }) => item.collectionId)).toEqual([collectionId]);
    let draft = await call("ulvia/cms.content", "/pages/create", "POST", {
        path: "/smoke-page",
        title: "Smoke Page",
        content,
    });
    expect((await fetch(`${origin}/smoke-page`, { redirect: "manual" })).status).toBe(404);
    draft = await call("ulvia/cms.content", "/pages/publish", "POST", {
        id: draft.id,
        expectedRevision: draft.revision,
        visible: true,
    });
    await verifyPublishedPage(page, origin);
    const invalid = await api.request(
        "ulvia/cms.content",
        "/pages/update",
        "POST",
        { id: draft.id, expectedRevision: 0, title: "Invalid" },
        (await session(origin, credentials)).actor,
    );
    expect(invalid.status).toBe(400);
    expect((await call("ulvia/cms.content", "/pages/get", "QUERY", { id: draft.id })).revision).toBe(draft.revision);
}

export async function verifyEdgeStateAfterRestart(page: Page, credentials: Credentials, origin: string): Promise<void> {
    const { call } = await session(origin, credentials);
    const installed = await call("ulvia/cms.installations", "/list-collection-installations");
    expect(installed.items.map((item: { collectionId: string }) => item.collectionId)).toEqual([collectionId]);
    const pages = await call("ulvia/cms.content", "/pages/list", "QUERY", { limit: 25 });
    expect(pages.items).toHaveLength(1);
    await verifyPublishedPage(page, origin);
    const persisted = await call("ulvia/cms.content", "/pages/get", "QUERY", { id: pages.items[0].id });
    await call("ulvia/cms.content", "/pages/delete", "POST", {
        id: persisted.id,
        expectedRevision: persisted.revision,
    });
    expect((await fetch(`${origin}/smoke-page`, { redirect: "manual" })).status).toBe(410);
}

async function verifyPublishedPage(page: Page, origin: string): Promise<void> {
    expect((await page.goto(`${origin}/smoke-page`))?.status()).toBe(200);
    await page.getByRole("heading", { name: "Smoke Page", exact: true }).waitFor();
    await page.getByText("Explicit collection", { exact: true }).waitFor();
}
