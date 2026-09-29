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
