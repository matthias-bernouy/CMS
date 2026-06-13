import { describe, test, expect } from "bun:test";
import { parseHTML } from "linkedom";
import type { CmsFilesMetadataRepository, FilesItem } from "@bernouy/cms-files";
import { InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { injectMediaVersions } from "@bernouy/cms-files";
import { manifestKey } from "@bernouy/cms-files";

/** Files metadata stub: id → contentHash. A missing id resolves to `null`; a
 *  present id with `undefined` hash resolves to a file with no contentHash. */
const stubFiles = (hashes: Record<string, string | undefined>): CmsFilesMetadataRepository => ({
    async getItem(id: string): Promise<FilesItem | null> {
        if (!(id in hashes)) return null;
        return { id, type: "file", name: "x", parentId: null, size: 1, mimeType: "image/png", contentHash: hashes[id], createdAt: new Date(), updatedAt: new Date() };
    },
}) as unknown as CmsFilesMetadataRepository;

async function render(bodyHtml: string, files: CmsFilesMetadataRepository | undefined): Promise<string> {
    const { document } = parseHTML(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`);
    await injectMediaVersions(document as unknown as Document, { files });
    return document.toString();
}

describe("injectMediaVersions", () => {
    test("stamps a by-id <img> with ?v=<contentHash>", async () => {
        const out = await render(`<img src="/.cms/files/by-id/abc">`, stubFiles({ abc: "h1" }));
        expect(out).toContain(`src="/.cms/files/by-id/abc?v=h1"`);
    });

    test("works under a tenant prefix", async () => {
        const out = await render(`<img src="/cms/.cms/files/by-id/abc">`, stubFiles({ abc: "h1" }));
        expect(out).toContain(`/cms/.cms/files/by-id/abc?v=h1`);
    });

    test("stamps the favicon <link rel=icon>", async () => {
        const out = await render(`<link rel="icon" href="/.cms/files/by-id/fav">`, stubFiles({ fav: "h2" }));
        expect(out).toContain(`href="/.cms/files/by-id/fav?v=h2"`);
    });

    test("a file with no contentHash is left unversioned", async () => {
        const out = await render(`<img src="/.cms/files/by-id/abc">`, stubFiles({ abc: undefined }));
        expect(out).toContain(`src="/.cms/files/by-id/abc"`);
        expect(out).not.toContain("?v=");
    });

    test("an unknown id is left unversioned", async () => {
        const out = await render(`<img src="/.cms/files/by-id/ghost">`, stubFiles({}));
        expect(out).not.toContain("?v=");
    });

    test("non-by-id URLs (data:, external, path route) are untouched", async () => {
        const html = `<img src="data:image/png;base64,AAAA"><img src="https://cdn.example/x.png"><img src="/.cms/files/logos/hero.png">`;
        const out = await render(html, stubFiles({ abc: "h1" }));
        expect(out).not.toContain("?v=");
    });

    test("no-op when no files backend is wired", async () => {
        const out = await render(`<img src="/.cms/files/by-id/abc">`, undefined);
        expect(out).toContain(`src="/.cms/files/by-id/abc"`);
        expect(out).not.toContain("?v=");
    });

    test("in-place update keeps the id and bumps the rendered ?v (the whole point)", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const f = await meta.createFile({ name: "logo.png", parentId: null, size: 2, mimeType: "image/png", contentHash: "hash-v1" });

        const renderedSrc = async (): Promise<string> => {
            const { document } = parseHTML(`<!DOCTYPE html><html><head></head><body><img src="/.cms/files/by-id/${f.id}"></body></html>`);
            await injectMediaVersions(document as unknown as Document, { files: meta });
            return document.querySelector("img")!.getAttribute("src")!;
        };

        // before: the rendered URL carries the current content hash
        expect(await renderedSrc()).toBe(`/.cms/files/by-id/${f.id}?v=hash-v1`);

        // replace the bytes IN PLACE — same id, new hash
        const updated = await meta.updateFileContent(f.id, { size: 9, mimeType: "image/png", contentHash: "hash-v2" });
        expect(updated?.id).toBe(f.id);            // id is unchanged
        expect(updated?.contentHash).toBe("hash-v2");

        // after: SAME id, new ?v → the immutable cache busts, content URL stayed clean
        expect(await renderedSrc()).toBe(`/.cms/files/by-id/${f.id}?v=hash-v2`);
    });

    test("dedupes lookups across repeated ids (same id, two imgs)", async () => {
        let calls = 0;
        const counting = { async getItem(id: string) { calls++; return { id, type: "file", contentHash: "h", name: "x", parentId: null, size: 1, mimeType: "image/png", createdAt: new Date(), updatedAt: new Date() } as FilesItem; } } as unknown as CmsFilesMetadataRepository;
        const out = await render(`<img src="/.cms/files/by-id/same"><img src="/.cms/files/by-id/same">`, counting);
        expect(calls).toBe(1);
        expect([...out.matchAll(/\?v=h/g)]).toHaveLength(2);
    });
});

describe("injectMediaVersions — responsive expansion (B3b)", () => {
    async function setup(mime: string, withManifest: boolean) {
        const files = new InMemoryCmsFilesMetadata();
        const variantStore = new InMemoryCmsFilesBlob();
        const f = await files.createFile({ name: "hero", parentId: null, size: 9, mimeType: mime, contentHash: "h9" });
        if (withManifest) await variantStore.put(manifestKey("h9"), new TextEncoder().encode(JSON.stringify({ format: "webp", widths: [320, 640], intrinsic: { width: 640, height: 480 } })));
        return { files, variantStore, id: f.id };
    }
    async function run(id: string, files: InMemoryCmsFilesMetadata, variantStore?: InMemoryCmsFilesBlob) {
        const { document } = parseHTML(`<!DOCTYPE html><html><head></head><body><img src="/.cms/files/by-id/${id}"></body></html>`);
        const unoptimized = await injectMediaVersions(document as unknown as Document, { files, variantStore });
        const img = document.querySelector("img")!;
        return { unoptimized, src: img.getAttribute("src"), srcset: img.getAttribute("srcset"), sizes: img.getAttribute("sizes"), width: img.getAttribute("width"), height: img.getAttribute("height") };
    }

    test("a raster image with a ready manifest expands to a srcset (variant URLs carry ?v); original stays the src; intrinsic w/h reserve the box", async () => {
        const { files, variantStore, id } = await setup("image/png", true);
        const r = await run(id, files, variantStore);
        expect(r.unoptimized).toEqual([]);
        expect(r.srcset).toBe(`/.cms/img/${id}/320.webp?v=h9 320w, /.cms/img/${id}/640.webp?v=h9 640w`);
        expect(r.sizes).toBe("100vw");
        expect(r.src).toBe(`/.cms/files/by-id/${id}?v=h9`);
        expect(r.width).toBe("640");
        expect(r.height).toBe("480");
    });

    test("a raster image with NO manifest yet → versioned original + returned for background optimization", async () => {
        const { files, variantStore, id } = await setup("image/png", false);
        const r = await run(id, files, variantStore);
        expect(r.unoptimized).toEqual([id]);
        expect(r.srcset).toBeNull();
        expect(r.src).toBe(`/.cms/files/by-id/${id}?v=h9`);
    });

    test("an SVG is never rasterized: no srcset, not enqueued", async () => {
        const { files, variantStore, id } = await setup("image/svg+xml", false);
        const r = await run(id, files, variantStore);
        expect(r.unoptimized).toEqual([]);
        expect(r.srcset).toBeNull();
    });

    test("without a variant store: versioned original only, nothing enqueued", async () => {
        const { files, id } = await setup("image/png", false);
        const r = await run(id, files, undefined);
        expect(r.unoptimized).toEqual([]);
        expect(r.srcset).toBeNull();
        expect(r.src).toBe(`/.cms/files/by-id/${id}?v=h9`);
    });
});
