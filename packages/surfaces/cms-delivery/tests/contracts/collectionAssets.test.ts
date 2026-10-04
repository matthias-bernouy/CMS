import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { collectionAssetVersion, resolveCollectionAssetExpressions } from "cms-delivery/core/assets/collectionAssets";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

test("serves installed collection assets publicly through immutable digest URLs", async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const asset = { id: "mark.svg", mediaType: "image/svg+xml", byteLength: bytes.byteLength, digest } as const;
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "design-system",
            publisherId: "ulvia.official",
            version: "1.0.0",
            name: "collection.name",
            locale: "en",
            translations: { en: { "collection.name": "Design system" } },
            exports: { blocs: [], themeTokens: [] },
            assets: [asset],
            blocs: [],
        },
        [{ id: "mark.svg", bytes }],
    );
    await store.install("site", artifact.digest, 0);

    const runner = new CaptureRunner("/site");
    let byteReads = 0;
    const delivery = new DeliveryCms({
        runner,
        repository: {} as ContentReader,
        collectionAssets: {
            siteId: "site",
            store: {
                getInstalledAssetMetadata: (siteId, collectionId, assetId) =>
                    store.getInstalledAssetMetadata(siteId, collectionId, assetId),
                getInstalledAssetMetadataBatch: (siteId, references) =>
                    store.getInstalledAssetMetadataBatch(siteId, references),
                getReleaseAsset: (releaseDigest, assetId, range) => {
                    byteReads += 1;
                    return store.getReleaseAsset(releaseDigest, assetId, range);
                },
            },
        },
    });
    const rendered = await resolveCollectionAssetExpressions(
        '<img src="{{ cms.asset.design-system.mark.svg }}">',
        delivery,
    );
    const version = await collectionAssetVersion(asset);
    expect(version).not.toBe(await collectionAssetVersion({ ...asset, mediaType: "application/octet-stream" }));
    expect(rendered).toContain(`/site/.cms/collections/design-system/assets/mark.svg?v=${version}`);

    const get = runner.defaultHandler("GET", "/site/.cms/collections");
    const url = `https://example.test/site/.cms/collections/design-system/assets/mark.svg?v=${version}`;
    const response = await get(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(byteReads).toBe(1);

    expect((await get(new Request(`${url.slice(0, -1)}0`))).status).toBe(404);
    const head = runner.defaultHandler("HEAD", "/site/.cms/collections");
    const headResponse = await head(new Request(url, { method: "HEAD" }));
    expect(headResponse.status).toBe(200);
    expect(headResponse.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(await headResponse.text()).toBe("");
    const notModified = await get(new Request(url, { headers: { "If-None-Match": `"other", W/"${version}"` } }));
    expect(notModified.status).toBe(304);
    expect(byteReads).toBe(1);

    const partial = await get(new Request(url, { headers: { Range: "bytes=5-11" } }));
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 5-11/${bytes.byteLength}`);
    expect(partial.headers.get("content-length")).toBe("7");
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(bytes.slice(5, 12));
    const suffix = await get(new Request(url, { headers: { Range: "bytes=-6" } }));
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get("content-range")).toBe(
        `bytes ${bytes.byteLength - 6}-${bytes.byteLength - 1}/${bytes.byteLength}`,
    );
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes.slice(-6));
    const staleIfRange = await get(new Request(url, { headers: { Range: "bytes=0-1", "If-Range": '"stale"' } }));
    expect(staleIfRange.status).toBe(200);
    expect(new Uint8Array(await staleIfRange.arrayBuffer())).toEqual(bytes);
    const readsBeforeInvalidRange = byteReads;
    const unsatisfiable = await get(new Request(url, { headers: { Range: `bytes=${bytes.byteLength}-` } }));
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe(`bytes */${bytes.byteLength}`);
    expect(byteReads).toBe(readsBeforeInvalidRange);
    expect((await get(new Request(url, { headers: { Range: "bytes=0-1,3-4" } }))).status).toBe(416);
    expect(byteReads).toBe(readsBeforeInvalidRange);

    const readsBeforeUninstall = byteReads;
    await store.uninstall("site", "design-system", 1);
    expect((await get(new Request(url))).status).toBe(404);
    expect(byteReads).toBe(readsBeforeUninstall);
});
