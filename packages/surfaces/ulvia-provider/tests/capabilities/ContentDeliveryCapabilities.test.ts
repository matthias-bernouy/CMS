import { expect, test } from "bun:test";
import {
    DefaultProviderCapabilityDispatcher,
    type ProviderBinaryResult,
    type ProviderCapabilityInvocationContext,
} from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
};

test("Content delivery exposes bounded projections and immutable collection asset bytes", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, {
        repo: {
            getContentContributions: async () => ({ revision: 7, pages: [], texts: [] }),
        },
        collections: {
            getInstalledAssetMetadata: async () => ({
                collectionId: "collection-a",
                digest: "sha256:digest-a",
                asset: { id: "asset-a", mediaType: "text/plain", byteLength: 5 },
            }),
            getReleaseAsset: async (_digest: string, _assetId: string, range?: { start: number; end: number }) =>
                new TextEncoder().encode(range ? "set" : "asset"),
        },
    } as never);

    const projection = (await dispatcher.invoke(
        "ulvia.cms.content",
        "delivery.read",
        { operation: "content.revision" },
        context,
    )) as { chunks: string[] };
    expect(JSON.parse(projection.chunks.join(""))).toBe(7);

    const resource = (await dispatcher.invoke(
        "ulvia.cms.content",
        "delivery.collection-asset",
        {
            collectionId: "collection-a",
            assetId: "asset-a",
            expectedDigest: "sha256:digest-a",
            rangeStart: 1,
            rangeEnd: 3,
        },
        context,
    )) as ProviderBinaryResult;
    expect(resource.contentType).toBe("text/plain");
    expect(await new Response(resource.stream).text()).toBe("set");
});

test("Content delivery rejects stale collection asset digests", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, {
        repo: {},
        collections: {
            getInstalledAssetMetadata: async () => ({
                collectionId: "collection-a",
                digest: "sha256:current",
                asset: { id: "asset-a", mediaType: "text/plain", byteLength: 5 },
            }),
        },
    } as never);

    await expect(
        dispatcher.invoke(
            "ulvia.cms.content",
            "delivery.collection-asset",
            {
                collectionId: "collection-a",
                assetId: "asset-a",
                expectedDigest: "sha256:stale",
            },
            context,
        ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});
