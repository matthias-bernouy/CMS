import { describe, test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { InMemoryCmsFilesBlob, LocalFsCmsFilesBlob } from "@bernouy/cms-files";
import { generateImageVariant, variantKey, ensureVariants, readManifest, manifestKey } from "@bernouy/cms-files";

// Note: requires libvips on the loader path (LD_LIBRARY_PATH in dev / system
// libvips in Docker) — sharp dlopens it at runtime.
const sourcePng = async (w: number, h: number): Promise<Uint8Array> =>
    new Uint8Array(
        await sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 200 } } })
            .png()
            .toBuffer(),
    );

const spec = { width: 200, format: "webp" as const };

describe("image variants (sharp)", () => {
    test("generateImageVariant resizes + encodes WebP, returns the actual size", async () => {
        const v = await generateImageVariant(await sourcePng(400, 300), spec);
        expect(v.width).toBe(200);
        expect(v.height).toBe(150);
        expect((await sharp(v.bytes).metadata()).format).toBe("webp");
    });

    test("never upscales past the source width (reports the source width)", async () => {
        const v = await generateImageVariant(await sourcePng(400, 300), { width: 999, format: "webp" });
        expect(v.width).toBe(400);
    });

    test("ensureVariants generates a ladder, dedupes to actual widths, writes a manifest", async () => {
        const store = new InMemoryCmsFilesBlob();
        const src = await sourcePng(400, 300);
        const manifest = await ensureVariants(store, "h1", src, [100, 200, 800]); // 800 collapses to 400
        expect(manifest.widths).toEqual([100, 200, 400]);
        expect(await store.exists(variantKey("h1", { width: 100, format: "webp" }))).toBe(true);
        expect(await store.exists(variantKey("h1", { width: 400, format: "webp" }))).toBe(true);
        expect(await store.exists(variantKey("h1", { width: 800, format: "webp" }))).toBe(false); // never the rung label
        expect((await readManifest(store, "h1"))?.widths).toEqual([100, 200, 400]);
    });

    test("records the source aspect ratio (largest variant's intrinsic w/h) in the manifest", async () => {
        const store = new InMemoryCmsFilesBlob();
        const manifest = await ensureVariants(store, "h2", await sourcePng(400, 300), [100, 200, 800]); // 800 → source 400×300
        expect(manifest.intrinsic).toEqual({ width: 400, height: 300 });
        expect((await readManifest(store, "h2"))?.intrinsic).toEqual({ width: 400, height: 300 });
    });

    test("ensureVariants is idempotent: a present manifest short-circuits (no regen)", async () => {
        const store = new InMemoryCmsFilesBlob();
        const src = await sourcePng(400, 300);
        await ensureVariants(store, "h1", src, [200]);
        await store.delete(variantKey("h1", { width: 200, format: "webp" })); // remove a variant
        await ensureVariants(store, "h1", src, [200]); // manifest still there → early return
        expect(await store.exists(variantKey("h1", { width: 200, format: "webp" }))).toBe(false); // NOT regenerated
        expect(await store.exists(manifestKey("h1"))).toBe(true);
    });

    test("keys are FLAT (no slash) — LocalFsCmsFilesBlob (slash-rejecting) accepts them", async () => {
        expect(variantKey("abc", { width: 640, format: "webp" })).not.toContain("/");
        expect(manifestKey("abc")).not.toContain("/");
        // The real dev blob store rejects slash keys; round-trip to prove it accepts ours.
        const dir = await mkdtemp(join(tmpdir(), "p9r-variants-"));
        try {
            const store = new LocalFsCmsFilesBlob(dir);
            await store.put(manifestKey("h"), new TextEncoder().encode("{}"));
            await store.put(variantKey("h", { width: 200, format: "webp" }), new Uint8Array([1, 2, 3]));
            expect(await store.exists(manifestKey("h"))).toBe(true);
            expect(await store.exists(variantKey("h", { width: 200, format: "webp" }))).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("a different contentHash is a different variant key (immutable keying)", async () => {
        const store = new InMemoryCmsFilesBlob();
        await ensureVariants(store, "hashA", await sourcePng(400, 300), [200]);
        expect(await store.exists(variantKey("hashA", spec))).toBe(true);
        expect(await store.exists(variantKey("hashB", spec))).toBe(false);
    });
});
