import { describe, test, expect, afterEach } from "bun:test";
import { InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { serveVariantRequest } from "@bernouy/cms-files";
import { variantKey } from "@bernouy/cms-files";

const PREFIX = "/.cms/img/";
const enc = new TextEncoder();
const req = (path: string) => new Request(`http://x${path}`);

async function setup(opts: { contentHash?: string; withVariant?: boolean; mimeType?: string } = {}) {
    const metadata = new InMemoryCmsFilesMetadata();
    const sourceBlob = new InMemoryCmsFilesBlob();
    const variantStore = new InMemoryCmsFilesBlob();
    const file = await metadata.createFile({ name: "hero.png", parentId: null, size: 8, mimeType: opts.mimeType ?? "image/png", contentHash: opts.contentHash });
    await sourceBlob.put(file.id, enc.encode("ORIGINAL"));
    if (opts.withVariant && opts.contentHash) {
        await variantStore.put(variantKey(opts.contentHash, { width: 200, format: "webp" }), enc.encode("WEBP200"));
    }
    return { deps: { metadata, sourceBlob, variantStore }, id: file.id };
}

const savedMode = process.env.MODE;
afterEach(() => { if (savedMode === undefined) delete process.env.MODE; else process.env.MODE = savedMode; });

describe("serveVariantRequest", () => {
    test("serves a ready variant immutable (prod), as image/webp", async () => {
        process.env.MODE = "PROD";
        const { deps, id } = await setup({ contentHash: "h1", withVariant: true });
        const res = await serveVariantRequest(deps, req(`${PREFIX}${id}/200.webp`), { prefix: PREFIX });
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/webp");
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
        expect(await res.text()).toBe("WEBP200");
    });

    test("in DEV a ready variant revalidates instead of immutable", async () => {
        process.env.MODE = "DEV";
        const { deps, id } = await setup({ contentHash: "h1", withVariant: true });
        const res = await serveVariantRequest(deps, req(`${PREFIX}${id}/200.webp`), { prefix: PREFIX });
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
    });

    test("falls back to the ORIGINAL (no-cache) when the variant isn't generated yet", async () => {
        process.env.MODE = "PROD";
        const { deps, id } = await setup({ contentHash: "h1", withVariant: false });
        const res = await serveVariantRequest(deps, req(`${PREFIX}${id}/200.webp`), { prefix: PREFIX });
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("image/png");          // the original
        expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
        expect(await res.text()).toBe("ORIGINAL");
    });

    test("a file with no contentHash serves the original (no variant lookup)", async () => {
        const { deps, id } = await setup({ contentHash: undefined });
        const res = await serveVariantRequest(deps, req(`${PREFIX}${id}/200.webp`), { prefix: PREFIX });
        expect(await res.text()).toBe("ORIGINAL");
    });

    test("non-raster originals are not served as image variant fallbacks", async () => {
        for (const mimeType of ["image/svg+xml", "text/html", "text/plain", "application/octet-stream"]) {
            const { deps, id } = await setup({ contentHash: "h1", mimeType });
            const res = await serveVariantRequest(deps, req(`${PREFIX}${id}/200.webp`), { prefix: PREFIX });
            expect(res.status).toBe(404);
        }
    });

    test("unknown id → 404", async () => {
        const { deps } = await setup({ contentHash: "h1" });
        expect((await serveVariantRequest(deps, req(`${PREFIX}nope/200.webp`), { prefix: PREFIX })).status).toBe(404);
    });

    test("malformed leaf or out-of-range width → 404 (no generation, just rejected)", async () => {
        const { deps, id } = await setup({ contentHash: "h1" });
        expect((await serveVariantRequest(deps, req(`${PREFIX}${id}/200.png`), { prefix: PREFIX })).status).toBe(404); // wrong format
        expect((await serveVariantRequest(deps, req(`${PREFIX}${id}/abc.webp`), { prefix: PREFIX })).status).toBe(404); // non-numeric
        expect((await serveVariantRequest(deps, req(`${PREFIX}${id}/99999.webp`), { prefix: PREFIX })).status).toBe(404); // > MAX_WIDTH
        expect((await serveVariantRequest(deps, req(`${PREFIX}${id}/0.webp`), { prefix: PREFIX })).status).toBe(404); // zero
    });
});
