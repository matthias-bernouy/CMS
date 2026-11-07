import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { CollectionVerificationPool } from "../../../src/runtime/instances/verification/CollectionVerificationPool";

const document = {
    kind: "collection",
    protocol: "ulvia-collection/v1",
    schemaDialect: "ulvia-schema/v1",
    collectionId: "test/collection",
    publisherId: "test",
    version: "1.0.0",
    name: "name",
    locale: "en",
    translations: { en: { name: "Collection" } },
    blocs: [],
    assets: [],
};

test("worker verification preserves exact identity, typed refusals and immutable asset bytes", async () => {
    const artifact = await admitCollectionRelease(document);
    const pool = new CollectionVerificationPool();
    try {
        expect((await pool.metadata(document, artifact.digest)).digest).toBe(artifact.digest);
        const copy = await pool.artifact(document, [], artifact.digest);
        expect(copy.canonicalJson).toBe(artifact.canonicalJson);
        expect(await rejection(pool.metadata(document, `sha256:${"0".repeat(64)}`))).toMatchObject({
            code: "asset_mismatch",
        });
        expect(await rejection(pool.metadata({ ...document, publisherId: "other" }, artifact.digest))).toMatchObject({
            code: "invalid_collection",
        });
        expect(await rejection(pool.evolution(artifact.release, artifact.release))).toMatchObject({
            publicationCode: "version_order",
        });
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
    } finally {
        await pool.close();
    }
    await expect(pool.metadata(document, artifact.digest)).rejects.toThrow("capacity");
});

test("queued cancellation, timeout and close release retained payloads and allow recovery", async () => {
    const artifact = await admitCollectionRelease(document);
    const pool = new CollectionVerificationPool(1);
    try {
        const active = pool.metadata(document, artifact.digest);
        const abort = new AbortController();
        const queued = pool.metadata(document, artifact.digest, abort.signal);
        abort.abort();
        await expect(queued).rejects.toMatchObject({ name: "AbortError" });
        await expect(active).rejects.toThrow("timed out");
    } finally {
        await pool.close();
    }
    expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
});

test("host worker queue is finite and another task survives cancellation of the active one", async () => {
    const artifact = await admitCollectionRelease(document);
    const pool = new CollectionVerificationPool();
    const controller = new AbortController();
    const active = pool.metadata(document, artifact.digest, controller.signal);
    const queued = Array.from({ length: 8 }, () => pool.metadata(document, artifact.digest));
    const excessive = pool.metadata(document, artifact.digest);
    controller.abort();
    try {
        await expect(active).rejects.toMatchObject({ name: "AbortError" });
        await expect(excessive).rejects.toThrow("capacity");
        expect((await Promise.all(queued)).map(({ digest }) => digest)).toEqual(Array(8).fill(artifact.digest));
        expect(pool.stats().bytes).toBe(0);
    } finally {
        await pool.close();
    }
});

async function rejection(value: Promise<unknown>): Promise<unknown> {
    try {
        await value;
    } catch (error) {
        return error;
    }
    throw new Error("Expected a refused verification");
}

test("worker asset inputs are snapshotted and corrupt bytes refuse", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const asset = {
        id: "data.bin",
        mediaType: "application/octet-stream",
        byteLength: bytes.length,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
    const release = { ...document, assets: [asset] };
    const admitted = await admitCollectionRelease(release, [{ id: asset.id, bytes }]);
    const pool = new CollectionVerificationPool();
    try {
        const pending = pool.artifact(release, [{ id: asset.id, bytes }], admitted.digest);
        bytes[0] = 9;
        const result = await pending;
        expect([...new Uint8Array(await result.assets[0]!.bytes.arrayBuffer())]).toEqual([1, 2, 3]);
        expect(Object.isFrozen(result.release)).toBe(true);
        const repeated = await pool.artifact(release, result.assets, admitted.digest);
        expect([...new Uint8Array(await repeated.assets[0]!.bytes.arrayBuffer())]).toEqual([1, 2, 3]);
        expect(await rejection(pool.artifact(release, [{ id: asset.id, bytes }], admitted.digest))).toMatchObject({
            code: "asset_mismatch",
        });
    } finally {
        await pool.close();
    }
});
