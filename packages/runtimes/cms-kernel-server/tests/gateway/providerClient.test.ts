import { expect, test } from "bun:test";
import { clientFixture } from "./providerClient.fixture";

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

test("projects gateway, Page access, collection assets and identity providers", async () => {
    const providers = [{ id: "local", label: "Local", type: "local", enabled: true }];
    const { client, requests } = clientFixture((request) =>
        Response.json({ value: request.body?.operation === "auth.identity-providers" ? providers : true }),
    );

    await client.pageExecution.requiredAccess(
        { page: { path: "/admin" } } as never,
        new URL("https://kernel.test/admin"),
    );
    await expect(client.pageExecution.authorizeCall({} as never, {} as never)).rejects.toThrow(
        "Capability authorization is owned by the Provider",
    );
    await client.gateway.invoker.invoke({} as never);
    await client.gateway.invoker.resolveHttp({} as never);
    await client.gateway.isAdministrator({ identifier: "subject-a" });
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
    expect(await client.identityProviders.list()).toEqual(providers);
    expect(await client.identityProviders.get("local")).toEqual(providers[0]);
    expect(await client.identityProviders.get("missing")).toBeNull();
    await expect(client.identityProviders.create({} as never)).rejects.toThrow(
        "Identity provider mutations are owned by the Provider",
    );
    await expect(client.identityProviders.update("local", {} as never)).rejects.toThrow(
        "Identity provider mutations are owned by the Provider",
    );
    await expect(client.identityProviders.delete("local")).rejects.toThrow(
        "Identity provider mutations are owned by the Provider",
    );

    expect(requests.map((request) => request.body?.operation)).toContain("assets.metadata-batch");
});

test("forwards every streaming endpoint with its canonical Provider path", async () => {
    const { client, requests } = clientFixture(() => new Response("ok"));
    await client.capability(new Request("https://kernel.test/.cms/call/catalog.items/list?limit=10"));
    await client.declarativeQuery(
        new Request("https://kernel.test/.cms/query/catalog.items/list", { method: "QUERY" }),
    );
    await client.collectionAsset(
        new Request("https://kernel.test/.cms/collections/collection-a/assets/logo.svg?download=1"),
    );
    await client.sitemap(new Request("https://kernel.test/sitemap-1.xml"));

    expect(requests.map((request) => `${request.url.pathname}${request.url.search}`)).toEqual([
        "/ulvia/kernel/v1/call/catalog.items/list?limit=10",
        "/ulvia/kernel/v1/queries/catalog.items/list",
        "/ulvia/kernel/v1/collections/collection-a/assets/logo.svg?download=1",
        "/ulvia/kernel/v1/sitemap/resource",
    ]);
    expect(new Headers(requests[3]?.init.headers).get("x-ulvia-original-path")).toBe("/sitemap-1.xml");
});
