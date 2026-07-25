import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { injectMediaVersions, InMemoryCmsFilesBlob, InMemoryCmsFilesMetadata, manifestKey } from "@bernouy/cms-files";

async function setupImage(mimeType: string, withManifest: boolean) {
    const files = new InMemoryCmsFilesMetadata();
    const variantStore = new InMemoryCmsFilesBlob();
    const file = await files.createFile({
        name: "hero",
        parentId: null,
        size: 9,
        mimeType,
        contentHash: "h9",
    });
    if (withManifest) {
        await variantStore.put(
            manifestKey("h9"),
            new TextEncoder().encode(
                JSON.stringify({ format: "webp", widths: [320, 640], intrinsic: { width: 640, height: 480 } }),
            ),
        );
    }
    return { files, variantStore, id: file.id };
}

async function renderImage(id: string, files: InMemoryCmsFilesMetadata, variantStore?: InMemoryCmsFilesBlob) {
    const { document } = parseHTML(
        `<!DOCTYPE html><html><head></head><body><img src="/.cms/files/by-id/${id}"></body></html>`,
    );
    const unoptimized = await injectMediaVersions(document as unknown as Document, { files, variantStore });
    const image = document.querySelector("img")!;
    return {
        unoptimized,
        src: image.getAttribute("src"),
        srcset: image.getAttribute("srcset"),
        sizes: image.getAttribute("sizes"),
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
    };
}

async function renderMarkup(
    markup: string,
    files: InMemoryCmsFilesMetadata,
    variantStore: InMemoryCmsFilesBlob,
): Promise<Element> {
    const { document } = parseHTML(`<!DOCTYPE html><html><head></head><body>${markup}</body></html>`);
    await injectMediaVersions(document as unknown as Document, { files, variantStore });
    return document.querySelector("img")!;
}

describe("injectMediaVersions responsive expansion", () => {
    test("expands a raster image with a manifest to versioned variants", async () => {
        const { files, variantStore, id } = await setupImage("image/png", true);
        const result = await renderImage(id, files, variantStore);
        expect(result.unoptimized).toEqual([]);
        expect(result.srcset).toBe(`/.cms/img/${id}/320.webp?v=h9 320w, /.cms/img/${id}/640.webp?v=h9 640w`);
        expect(result.sizes).toBe("100vw");
        expect(result.src).toBe(`/.cms/files/by-id/${id}?v=h9`);
        expect(result.width).toBe("640");
        expect(result.height).toBe("480");
    });

    test("lets lazy images use their rendered width without overriding authored sizes", async () => {
        const { files, variantStore, id } = await setupImage("image/png", true);
        const automatic = await renderMarkup(`<img src="/.cms/files/by-id/${id}" loading="lazy">`, files, variantStore);
        const authored = await renderMarkup(
            `<img src="/.cms/files/by-id/${id}" loading="lazy" sizes="50vw">`,
            files,
            variantStore,
        );

        expect(automatic.getAttribute("sizes")).toBe("auto, 100vw");
        expect(authored.getAttribute("sizes")).toBe("50vw");
    });

    test("returns a raster image without a manifest for optimization", async () => {
        const { files, variantStore, id } = await setupImage("image/png", false);
        const result = await renderImage(id, files, variantStore);
        expect(result.unoptimized).toEqual([id]);
        expect(result.srcset).toBeNull();
        expect(result.src).toBe(`/.cms/files/by-id/${id}?v=h9`);
    });

    test("never rasterizes SVG images", async () => {
        const { files, variantStore, id } = await setupImage("image/svg+xml", false);
        const result = await renderImage(id, files, variantStore);
        expect(result.unoptimized).toEqual([]);
        expect(result.srcset).toBeNull();
    });

    test("keeps only the versioned original without a variant store", async () => {
        const { files, id } = await setupImage("image/png", false);
        const result = await renderImage(id, files);
        expect(result.unoptimized).toEqual([]);
        expect(result.srcset).toBeNull();
        expect(result.src).toBe(`/.cms/files/by-id/${id}?v=h9`);
    });
});
