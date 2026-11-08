import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { manifest, uploadFixture } from "./uploadFixtures";

test("expiration cleanup leaves an in-flight asset stream intact and reclaims it after the stage releases its lease", async () => {
    const f = await uploadFixture();
    let finish!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
        finish = resolve;
    });
    const began = new Promise<void>((resolve) => {
        started = resolve;
    });
    const bytes = new TextEncoder().encode("verified");
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    let pulls = 0;
    let putting: Promise<void> | undefined;
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (pulls++ === 0) {
                controller.enqueue(bytes);
                return;
            }
            started();
            await gate;
            controller.close();
        },
    });
    try {
        const store = f.open();
        const receipt = await store.create(
            manifest({ assets: [{ id: "asset", byteLength: bytes.length, digest }] }),
            f.expiry(),
        );
        putting = store.putAsset(receipt.uploadId, "asset", body, digest, bytes.length);
        await began;
        expect(body.locked).toBe(true);
        const directory = join(f.root, ".publication-uploads", receipt.uploadId);
        const path = join(directory, "upload.json");
        const metadata = await Bun.file(path).json();
        await writeFile(path, JSON.stringify({ ...metadata, expiresAt: new Date(Date.now() - 1).toISOString() }));
        await store.recover();
        expect((await stat(directory)).isDirectory()).toBe(true);
        finish();
        await putting;
        expect(body.locked).toBe(false);
        await expect(store.status(receipt.uploadId)).rejects.toThrow("expired");
        await store.recover();
        await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
        finish();
        await putting?.catch(() => {});
        await f.close();
    }
});
