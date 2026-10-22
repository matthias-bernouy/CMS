import { expect, test } from "bun:test";
import { REQUEST_ID_HEADER, runWithRequestContext } from "@bernouy/http-runner/observability";
import { clientFixture } from "./providerClient.fixture";
import { createMemoryLogger } from "@bernouy/logging/testing";

test("projects every content read through the versioned Provider query endpoint", async () => {
    const { client, requests } = clientFixture((request) => {
        if (request.body?.operation === "content.texts") {
            return Response.json({
                value: {
                    defaultLocale: "en",
                    sources: [{ namespace: "shop", catalogues: { en: { title: "Shop" }, fr: { title: "Boutique" } } }],
                },
            });
        }
        return Response.json({ value: request.body?.operation });
    });

    const texts = await client.content.getContentTexts();
    expect(texts[0]?.resolve("fr")).toEqual({ title: "Boutique" });
    expect(texts[0]?.resolve("de")).toEqual({ title: "Shop" });
    await client.content.getContentRevision();
    await client.content.getRenderingRevision!();
    await client.editorialPages.resolveRoute("/about");
    await client.content.getRenderablePage("/about");
    await client.content.getRenderablePages();
    await client.content.resolvePageReference({ path: "/about" });
    await client.content.resolvePagePaths(["/about"]);
    await client.content.resolveRenderableRoute("/about");
    await client.content.getPublishedPage("/about");
    await client.content.getPublishedPageById("page-a");
    await client.content.getPublishedPages();
    await client.content.resolvePublishedRoute("/about");
    await client.content.getRenderableBlocs();
    await client.content.getBlocViewJS("shop-card");
    await client.content.getRenderingSettings();

    expect(requests.map((request) => request.body?.operation)).toEqual([
        "content.texts",
        "content.revision",
        "content.rendering-revision",
        "content.editorial-route",
        "content.renderable-page",
        "content.renderable-pages",
        "content.resolve-page-reference",
        "content.resolve-page-paths",
        "content.resolve-renderable-route",
        "content.published-page",
        "content.published-page-by-id",
        "content.published-pages",
        "content.resolve-published-route",
        "content.renderable-blocs",
        "content.bloc-view-js",
        "content.rendering-settings",
    ]);
    expect(requests.every((request) => request.url.pathname === "/ulvia/kernel/v1/query")).toBe(true);
});

test("projects collection asset metadata while bytes remain streamed", async () => {
    const { client, requests } = clientFixture(() => Response.json({ value: true }));

    await client.collectionAssets.store.getInstalledAssetMetadata("ignored", "collection-a", "asset-a");
    await client.collectionAssets.store.getInstalledAssetMetadataBatch("ignored", [
        {
            collectionId: "collection-a",
            assetId: "asset-a",
        },
    ]);
    await expect(client.collectionAssets.store.getReleaseAsset("collection-a", "1.0.0", "asset-a")).rejects.toThrow(
        "Collection asset bytes are streamed through the Provider proxy",
    );
    expect(requests.map((request) => request.body?.operation)).toContain("assets.metadata-batch");
});

test("forwards remaining content-owned streaming endpoints with their canonical Provider paths", async () => {
    const { client, requests } = clientFixture(() => new Response("ok"));
    await client.collectionAsset(
        new Request("https://kernel.test/.cms/collections/collection-a/assets/logo.svg?download=1"),
    );
    await client.sitemap(new Request("https://kernel.test/sitemap-1.xml"));

    expect(requests.map((request) => `${request.url.pathname}${request.url.search}`)).toEqual([
        "/ulvia/kernel/v1/collections/collection-a/assets/logo.svg?download=1",
        "/ulvia/kernel/v1/sitemap/resource",
    ]);
    expect(new Headers(requests[1]?.init.headers).get("x-ulvia-original-path")).toBe("/sitemap-1.xml");
});

test("propagates the current request id through queries and forwarded requests", async () => {
    const requestId = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
    const { client, requests } = clientFixture((request) =>
        request.body ? Response.json({ value: "ok" }) : new Response("ok"),
    );
    const inbound = new Request("https://kernel.test/admin", {
        headers: { [REQUEST_ID_HEADER]: requestId },
    });

    await runWithRequestContext(inbound, async () => {
        await client.query("content.revision");
        await client.collectionAsset(new Request("https://kernel.test/.cms/collections/shop/assets/logo.svg"));
    });

    expect(new Headers(requests[0]?.init.headers).get(REQUEST_ID_HEADER)).toBe(requestId);
    expect(new Headers(requests[1]?.init.headers).get(REQUEST_ID_HEADER)).toBe(requestId);
});

test("identifies failed Provider query operations without logging their inputs", async () => {
    const memory = createMemoryLogger({ service: "kernel", level: "debug" });
    const { client } = clientFixture(() => new Response("Unavailable", { status: 503 }), memory.logger);

    await expect(client.query("content.renderable-page", { path: "/private" })).rejects.toThrow(
        "Provider query failed (503)",
    );

    expect(memory.records).toHaveLength(1);
    expect(memory.records[0]).toMatchObject({
        level: "warn",
        event: "provider.query.rejected",
        attributes: { operation: "content.renderable-page", status: 503 },
    });
    expect(JSON.stringify(memory.records[0])).not.toContain("/private");
});
