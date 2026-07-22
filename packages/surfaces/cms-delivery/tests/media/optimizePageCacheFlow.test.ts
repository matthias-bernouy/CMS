import { describe, test, expect, afterEach } from "bun:test";
import sharp from "sharp";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { TtlCache } from "@bernouy/http-runner";
import { type CacheEntry } from "@bernouy/http-runner";
import { InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob, sha256Hex } from "@bernouy/cms-files";
import { P9R_CACHE } from "@bernouy/cms-content";
import { readManifest } from "@bernouy/cms-files";
import type { ContentReader } from "@bernouy/cms-content";

// optimizePage never touches the repository, so an empty stub is fine.
const stubRepo = {} as unknown as ContentReader;
const fakeEntry = (): CacheEntry => {
    const b = new Uint8Array([1]);
    return { raw: b, brotli: b, gzip: b, contentType: "text/html", hash: "x" };
};
const until = async (cond: () => boolean) => {
    for (let i = 0; i < 300 && !cond(); i++) {
        await new Promise((r) => setTimeout(r, 10));
    }
};

const savedMode = process.env.MODE;
afterEach(() => {
    if (savedMode === undefined) {
        delete process.env.MODE;
    } else {
        process.env.MODE = savedMode;
    }
});

describe("optimizePage — PROD cache flow (the pickup that dev-mode + the integration test skip)", () => {
    test("a cached page is invalidated once its images are optimized → re-renders with the srcset", async () => {
        process.env.MODE = "PROD";
        const cache = new TtlCache({ bypass: process.env.MODE === "DEV" });
        const files = new InMemoryCmsFilesMetadata();
        const sourceBlob = new InMemoryCmsFilesBlob();
        const variantStore = new InMemoryCmsFilesBlob();

        const png = new Uint8Array(
            await sharp({ create: { width: 800, height: 500, channels: 3, background: { r: 50, g: 80, b: 120 } } })
                .png()
                .toBuffer(),
        );
        const hash = sha256Hex(png);
        const file = await files.createFile({
            name: "a.png",
            parentId: null,
            size: png.byteLength,
            mimeType: "image/png",
            contentHash: hash,
        });
        await sourceBlob.put(file.id, png);

        const delivery = new DeliveryCms({
            repository: stubRepo,
            cache,
            filesMetadata: files,
            filesBlob: sourceBlob,
            variantStore,
        });

        const key = P9R_CACHE.page("/p");
        cache.set(key, fakeEntry()); // the cold render cached the un-optimized page
        expect(cache.get(key)).not.toBeNull();

        delivery.optimizePage("/p", [file.id]); // enqueue: generate variants, then invalidate

        await until(() => cache.get(key) === null);
        expect(cache.get(key)).toBeNull(); // invalidated → next render emits srcset
        expect(await readManifest(variantStore, hash)).not.toBeNull(); // variants were really generated
    });

    test("a page with nothing to optimize is left cached (no needless invalidation)", async () => {
        process.env.MODE = "PROD";
        const cache = new TtlCache({ bypass: process.env.MODE === "DEV" });
        const delivery = new DeliveryCms({
            repository: stubRepo,
            cache,
            filesMetadata: new InMemoryCmsFilesMetadata(),
            filesBlob: new InMemoryCmsFilesBlob(),
            variantStore: new InMemoryCmsFilesBlob(),
        });
        const key = P9R_CACHE.page("/p");
        cache.set(key, fakeEntry());
        delivery.optimizePage("/p", []); // no image ids → no-op
        expect(cache.get(key)).not.toBeNull(); // untouched
    });
});
