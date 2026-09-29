import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { providerByteGeneration } from "@bernouy/cms-gateway/media";
import { LocalProviderImageStore } from "@bernouy/cms-gateway/media/local-fs";

test("provider derivative cache survives restart and rejects corrupted bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cms-provider-images-"));
    const key = `sha256:${"a".repeat(64)}`;
    const bytes = new Uint8Array([1, 2, 3]);
    try {
        const store = new LocalProviderImageStore(directory);
        await store.put(key, { bytes, etag: `"${await providerByteGeneration(bytes)}"`, width: 128, height: 64 });
        const restarted = new LocalProviderImageStore(directory);
        expect(await restarted.get(key)).toEqual({
            bytes,
            etag: `"${await providerByteGeneration(bytes)}"`,
            width: 128,
            height: 64,
        });
        await writeFile(join(directory, `${"a".repeat(64)}.webp`), new Uint8Array([9]));
        expect(await restarted.get(key)).toBeNull();
        expect(await readFile(join(directory, `${"a".repeat(64)}.json`)).catch(() => null)).toBeNull();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("parallel derivative writes cannot delete each other's temporary files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cms-provider-images-parallel-"));
    try {
        const store = new LocalProviderImageStore(directory);
        const entries = await Promise.all(
            Array.from({ length: 24 }, async (_, index) => {
                const key = `sha256:${index.toString(16).padStart(64, "0")}`;
                const bytes = new Uint8Array([index + 1, 2, 3]);
                return { key, bytes, etag: `"${await providerByteGeneration(bytes)}"` };
            }),
        );
        await Promise.all(
            entries.map(({ key, bytes, etag }) => store.put(key, { bytes, etag, width: 128, height: 64 })),
        );
        for (const { key, bytes } of entries) {
            expect((await store.get(key))?.bytes).toEqual(bytes);
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
