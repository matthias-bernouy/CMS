import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";
import { optimizePageImages, readManifest, variantKey } from "@bernouy/cms-content/files/serving";
import { createLocalAuthorFileStores, createPublicFileStores } from "../../src/runtime/stores/authorFiles";

test("production file composition restricts methods and confines derivative writes and cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cms-content-stores-"));
    try {
        const stores = createLocalAuthorFileStores(directory);
        const metadata = new InMemoryCmsFilesMetadata();
        const bytes = new Uint8Array(
            await sharp({
                create: { width: 16, height: 16, channels: 3, background: "blue" },
            })
                .png()
                .toBuffer(),
        );
        const file = await metadata.createFile({
            name: "draft-image.png",
            parentId: null,
            size: bytes.length,
            mimeType: "image/png",
            contentHash: "hash",
        });
        await stores.filesBlob.put(file.id, bytes);
        // Deliberately colliding flat keys demonstrate that destinations, not key naming, isolate stores.
        await stores.filesBlob.put("manifest.json", new TextEncoder().encode("original manifest"));
        const publicStores = createPublicFileStores({ ...stores, filesMetadata: metadata });
        expect(Object.keys(publicStores.filesBlob)).toEqual(["get"]);
        expect(Object.keys(publicStores.filesMetadata).sort()).toEqual(["getItem", "getItemByPath"]);
        expect(Object.keys(publicStores.variantStore).sort()).toEqual(["get", "put"]);
        expect(Object.keys(publicStores.sitemapStore).sort()).toEqual(["delete", "get", "put"]);
        await optimizePageImages(
            {
                metadata: publicStores.filesMetadata,
                sourceBlob: publicStores.filesBlob,
                variantStore: publicStores.variantStore,
            },
            [file.id],
            [8],
        );
        expect((await readManifest(publicStores.variantStore, "hash"))?.widths).toEqual([8]);
        const variant = variantKey("hash", { width: 8, format: "webp" });
        expect(await Bun.file(join(directory, ".variants", variant)).exists()).toBe(true);
        expect(await stores.filesBlob.get(variant)).toBeNull();
        await publicStores.variantStore.put("manifest.json", new TextEncoder().encode("variant manifest"));
        await publicStores.sitemapStore.put("manifest.json", new TextEncoder().encode("sitemap manifest"));
        await publicStores.sitemapStore.delete("manifest.json");
        expect(await new Response(await stores.filesBlob.get("manifest.json")).text()).toBe("original manifest");
        expect(await new Response(await publicStores.variantStore.get("manifest.json")).text()).toBe(
            "variant manifest",
        );
        expect(new Uint8Array(await new Response(await publicStores.filesBlob.get(file.id)).arrayBuffer())).toEqual(
            bytes,
        );
        for (const path of [directory, join(directory, ".variants"), join(directory, ".sitemaps")]) {
            expect((await readdir(path)).some((name) => name.startsWith(".pending-"))).toBe(false);
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
