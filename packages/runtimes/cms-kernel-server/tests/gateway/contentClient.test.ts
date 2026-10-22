import { expect, test } from "bun:test";
import type { GatewayInvocation, GatewayResult } from "@bernouy/cms-gateway";
import { createMemoryLogger } from "@bernouy/logging/testing";
import { GatewayContentClient } from "../../src/runtime/content/GatewayContentClient";

test("projects all Kernel content reads through the selected Content capability", async () => {
    const invocations: GatewayInvocation[] = [];
    const gateway = {
        invoke: async (invocation: GatewayInvocation): Promise<GatewayResult> => {
            invocations.push(invocation);
            const input = invocation.input as Record<string, unknown>;
            const operation = String(input.operation);
            const value =
                operation === "content.texts"
                    ? {
                          defaultLocale: "en",
                          sources: [
                              {
                                  namespace: "shop",
                                  catalogues: { en: { title: "Shop" }, fr: { title: "Boutique" } },
                              },
                          ],
                      }
                    : operation === "assets.metadata"
                      ? {
                            collectionId: "collection-a",
                            digest: "sha256:digest-a",
                            asset: { id: "asset-a", mediaType: "text/plain", byteLength: 5 },
                        }
                      : operation === "assets.metadata-batch"
                        ? []
                        : operation;
            return {
                kind: "success",
                requestId: crypto.randomUUID(),
                status: 200,
                output: { chunks: [JSON.stringify(value)] },
            };
        },
    };
    const client = new GatewayContentClient(gateway as never, createMemoryLogger().logger);

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
    await client.collectionAssets.store.getInstalledAssetMetadata("ignored", "collection-a", "asset-a");
    await client.collectionAssets.store.getInstalledAssetMetadataBatch("ignored", []);

    expect(invocations.map((invocation) => (invocation.input as Record<string, unknown>).operation)).toEqual([
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
        "assets.metadata",
        "assets.metadata-batch",
    ]);
    expect(invocations.every((invocation) => invocation.contractId === "ulvia.cms.content")).toBeTrue();
    expect(invocations.every((invocation) => invocation.capabilityId === "delivery.read")).toBeTrue();
    expect(invocations.every((invocation) => invocation.actor.kind === "system")).toBeTrue();
});

test("streams collection assets and sitemap resources through Content capabilities", async () => {
    const invocations: GatewayInvocation[] = [];
    const gateway = {
        invoke: async (invocation: GatewayInvocation): Promise<GatewayResult> => {
            invocations.push(invocation);
            if (invocation.capabilityId === "delivery.read") {
                return success({
                    chunks: [
                        JSON.stringify({
                            collectionId: "collection-a",
                            digest: "sha256:digest-a",
                            asset: { id: "asset-a", mediaType: "text/plain", byteLength: 5 },
                        }),
                    ],
                });
            }
            const bytes = new TextEncoder().encode(invocation.capabilityId === "delivery.sitemap" ? "<xml/>" : "asset");
            return {
                kind: "binary",
                requestId: crypto.randomUUID(),
                status: 200,
                stream: new Response(bytes).body!,
                contentType: invocation.capabilityId === "delivery.sitemap" ? "application/xml" : "text/plain",
                contentLength: bytes.byteLength,
                responseHeaders: { "cache-control": "public, no-cache" },
            };
        },
    };
    const client = new GatewayContentClient(gateway as never, createMemoryLogger().logger);
    const metadata = await client.collectionAssets.store.getInstalledAssetMetadata(
        "default",
        "collection-a",
        "asset-a",
    );
    expect(metadata?.digest).toBe("sha256:digest-a");
    expect(
        new TextDecoder().decode(
            await client.collectionAssets.store.getReleaseAsset("sha256:digest-a", "asset-a", {
                start: 1,
                end: 3,
            }),
        ),
    ).toBe("asset");
    const sitemap = await client.sitemap(new Request("https://site.test/sitemap.xml"));
    expect(await sitemap.text()).toBe("<xml/>");
    expect(sitemap.headers.get("cache-control")).toBe("public, no-cache");

    expect(invocations.map(({ capabilityId }) => capabilityId)).toEqual([
        "delivery.read",
        "delivery.collection-asset",
        "delivery.sitemap",
    ]);
    expect(invocations[1]?.input).toEqual({
        collectionId: "collection-a",
        assetId: "asset-a",
        expectedDigest: "sha256:digest-a",
        rangeStart: 1,
        rangeEnd: 3,
    });
});

test("rejects malformed and declared-error delivery responses", async () => {
    const memory = createMemoryLogger({ service: "kernel", level: "debug" });
    const malformed = new GatewayContentClient(
        { invoke: async () => ({ kind: "success", requestId: crypto.randomUUID(), status: 200, output: {} }) } as never,
        memory.logger,
    );
    await expect(malformed.read("content.revision")).rejects.toThrow("invalid response chunks");

    const rejected = new GatewayContentClient(
        {
            invoke: async () => ({
                kind: "declared-error",
                requestId: crypto.randomUUID(),
                status: 503,
                errorCode: "CORE_UNAVAILABLE",
                retryable: true,
            }),
        } as never,
        memory.logger,
    );
    await expect(rejected.read("content.renderable-page", { path: "/private" })).rejects.toThrow(
        "Content delivery rejected content.renderable-page (503)",
    );
    expect(JSON.stringify(memory.records)).not.toContain("/private");
});

function success(output: unknown): GatewayResult {
    return { kind: "success", requestId: crypto.randomUUID(), status: 200, output };
}
