import { expect } from "bun:test";
import type { Page } from "playwright";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { sampleContract } from "./publication/resource";

/** Actual releases exercise continuation and filter changes, without mocked browser responses. */
export async function exerciseRepositoryPagination(page: Page, origin: string, token: string) {
    const namespace = "browser.publisher";
    const info = await (await fetch(`${origin}/.cms/call/ulvia/repository/v1/info`)).json();
    const writer = new RemoteRepositoryClient(
        origin,
        {
            origin,
            repositoryId: info.repositoryId,
            namespace,
            revision: 1,
            resolveToken: async () => token,
        },
        { allowInsecureHttp: true },
    );
    // The application page size is twenty: one extra real release must appear on page two.
    for (let index = 0; index < 21; index++) {
        const sample = await sampleContract(namespace, `1.0.${index}`);
        await writer.push({
            kind: "contract",
            canonicalJson: JSON.parse(sample.manifest).canonicalJson,
            assets: [{ id: sample.asset.id, bytes: sample.bytes }],
        });
    }
    const open = async (path: string) => {
        expect((await page.goto(`${origin}${path}`))?.status()).toBe(200);
        await page.evaluate(() => customElements.whenDefined("cms-binding-core"));
    };
    const next = async (key: string) =>
        Promise.all([
            page.waitForURL((url) => url.searchParams.has(key)),
            page.getByRole("link", { name: "Next page", exact: true }).click(),
        ]);
    await open(`/account/publications?ulvia--repository--publisher=${namespace}&ulvia--repository--kind=contract`);
    await page.getByText(`${namespace} / ${namespace}.greeting @ 1.0.0`, { exact: true }).waitFor();
    expect(await page.getByRole("link", { name: "Greeting examples", exact: true }).count()).toBe(20);
    await next("ulvia--repository--catalogue-cursor");
    await page.getByText(`${namespace} / ${namespace}.greeting @ 1.0.20`, { exact: true }).waitFor();
    expect(await page.getByRole("link", { name: "Greeting examples", exact: true }).count()).toBe(1);
    await Promise.all([
        page.waitForURL(
            (url) =>
                url.searchParams.get("ulvia--repository--kind") === "provider-manifest" &&
                !url.searchParams.has("ulvia--repository--catalogue-cursor"),
        ),
        page
            .getByRole("navigation", { name: "Resource type", exact: true })
            .getByRole("link", { name: "Providers", exact: true })
            .click(),
    ]);
    await page.getByText("No entries to display.", { exact: true }).waitFor();
    expect(new URL(page.url()).searchParams.get("ulvia--repository--publisher")).toBe(namespace);
    expect(new URL(page.url()).searchParams.get("ulvia--repository--kind")).toBe("provider-manifest");
    expect(await page.getByRole("alert").count()).toBe(0);

    await open("/?ulvia--repository--kind=contract");
    await next("ulvia--repository--catalogue-cursor");
    await Promise.all([
        page.waitForURL(
            (url) =>
                url.searchParams.get("ulvia--repository--kind") === "collection" &&
                !url.searchParams.has("ulvia--repository--catalogue-cursor"),
        ),
        page
            .getByRole("navigation", { name: "Resource type", exact: true })
            .getByRole("link", { name: "Collections", exact: true })
            .click(),
    ]);
    await page.locator("main").getByRole("heading", { level: 2 }).first().waitFor();
    expect(new URL(page.url()).searchParams.get("ulvia--repository--kind")).toBe("collection");
    expect(await page.getByRole("alert").count()).toBe(0);

    await open("/search?ulvia--repository--query=mossa");
    await next("ulvia--repository--search-cursor");
    await page.getByRole("link", { name: "Change search", exact: true }).waitFor();
    expect(await page.getByLabel("Search resources", { exact: true }).count()).toBe(0);
    await Promise.all([
        page.waitForURL(`${origin}/search`),
        page.getByRole("link", { name: "Change search", exact: true }).click(),
    ]);
    await page.getByLabel("Search resources", { exact: true }).fill("greeting");
    await page.getByRole("link", { name: "Greeting examples", exact: true }).first().waitFor();
    expect(new URL(page.url()).searchParams.get("ulvia--repository--query")).toBe("greeting");
    expect(await page.getByRole("alert").count()).toBe(0);
}
