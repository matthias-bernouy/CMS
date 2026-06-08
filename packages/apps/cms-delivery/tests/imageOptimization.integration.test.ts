import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import sharp from "sharp";
import { InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob, sha256Hex } from "@bernouy/cms-shared";
import { injectMediaVersions } from "cms-delivery/core/html/injectMediaVersions";
import { optimizePageImages } from "cms-delivery/core/images/optimizePageJob";
import { serveVariantRequest } from "cms-delivery/core/images/serveVariant";

/**
 * End-to-end: a real image flows through the REAL render → enqueue → generate →
 * render → serve path (real sharp), proving the pieces integrate — not just that
 * each unit works in isolation. Requires libvips on the loader path.
 */
describe("image optimization — full pipeline", () => {
    test("cold original → worker generates → warm srcset → serves a real, smaller WebP", async () => {
        const files = new InMemoryCmsFilesMetadata();
        const sourceBlob = new InMemoryCmsFilesBlob();
        const variantStore = new InMemoryCmsFilesBlob();

        const png = new Uint8Array(await sharp({ create: { width: 1000, height: 600, channels: 3, background: { r: 30, g: 90, b: 160 } } }).png().toBuffer());
        const hash = sha256Hex(png);
        const file = await files.createFile({ name: "hero.png", parentId: null, size: png.byteLength, mimeType: "image/png", contentHash: hash });
        await sourceBlob.put(file.id, png);

        const renderImg = async () => {
            const { document } = parseHTML(`<!DOCTYPE html><html><body><img src="/.cms/files/by-id/${file.id}"></body></html>`);
            const unoptimized = await injectMediaVersions(document as unknown as Document, { files, variantStore });
            const img = document.querySelector("img")!;
            return { srcset: img.getAttribute("srcset"), src: img.getAttribute("src"), unoptimized };
        };

        // 1) cold render: original served, image flagged for optimization
        const cold = await renderImg();
        expect(cold.srcset).toBeNull();
        expect(cold.src).toBe(`/.cms/files/by-id/${file.id}?v=${hash}`);
        expect(cold.unoptimized).toEqual([file.id]);

        // 2) the background worker generates the ladder (real sharp)
        await optimizePageImages({ metadata: files, sourceBlob, variantStore }, cold.unoptimized, [320, 640, 960, 1280]);

        // 3) warm render: now a responsive srcset, capped at the 1000px source
        const warm = await renderImg();
        expect(warm.unoptimized).toEqual([]);
        expect(warm.srcset).toContain(`/.cms/img/${file.id}/320.webp?v=${hash} 320w`);
        expect(warm.srcset).toContain(`/.cms/img/${file.id}/960.webp?v=${hash} 960w`);
        expect(warm.srcset).toContain("1000w");        // 1280 rung collapsed onto the source width
        expect(warm.srcset).not.toContain("1280w");

        // 4) serve one srcset candidate → a real WebP, smaller than the source
        const res = await serveVariantRequest(
            { metadata: files, sourceBlob, variantStore },
            new Request(`http://x/.cms/img/${file.id}/640.webp`),
            { prefix: "/.cms/img/" },
        );
        expect(res.headers.get("Content-Type")).toBe("image/webp");
        const variantBytes = new Uint8Array(await res.arrayBuffer());
        const meta = await sharp(variantBytes).metadata();
        expect(meta.format).toBe("webp");
        expect(meta.width).toBe(640);
        expect(variantBytes.byteLength).toBeLessThan(png.byteLength); // genuinely optimized
    });
});
