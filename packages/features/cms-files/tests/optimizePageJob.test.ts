import { describe, test, expect } from "bun:test";
import sharp from "sharp";
import { InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { optimizePageImages } from "@bernouy/cms-files";
import { readManifest, variantKey } from "@bernouy/cms-files";

// Requires libvips on the loader path (sharp).
const png = async (w: number, h: number): Promise<Uint8Array> =>
    new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer());

describe("optimizePageImages", () => {
    test("generates variants + manifest for raster images; skips SVG, legacy, and unknown ids", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const sourceBlob = new InMemoryCmsFilesBlob();
        const variantStore = new InMemoryCmsFilesBlob();

        const img = await metadata.createFile({ name: "a.png", parentId: null, size: 1, mimeType: "image/png", contentHash: "hImg" });
        await sourceBlob.put(img.id, await png(500, 400));
        const svg = await metadata.createFile({ name: "b.svg", parentId: null, size: 1, mimeType: "image/svg+xml", contentHash: "hSvg" });
        await sourceBlob.put(svg.id, new TextEncoder().encode("<svg/>"));
        const legacy = await metadata.createFile({ name: "c.png", parentId: null, size: 1, mimeType: "image/png" }); // no contentHash

        await optimizePageImages({ metadata, sourceBlob, variantStore }, [img.id, svg.id, legacy.id, "ghost"], [200, 999]);

        // raster image → variants + manifest (999 capped to the 500px source)
        expect((await readManifest(variantStore, "hImg"))?.widths).toEqual([200, 500]);
        expect(await variantStore.exists(variantKey("hImg", { width: 200, format: "webp" }))).toBe(true);
        expect(await variantStore.exists(variantKey("hImg", { width: 500, format: "webp" }))).toBe(true);

        // SVG skipped (no raster manifest)
        expect(await readManifest(variantStore, "hSvg")).toBeNull();
    });
});
