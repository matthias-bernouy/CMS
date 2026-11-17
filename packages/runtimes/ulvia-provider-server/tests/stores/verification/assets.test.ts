import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { CollectionVerificationPool } from "../../../src/runtime/instances/verification/CollectionVerificationPool";

test("asset-only worker tasks snapshot bytes, enforce exact declarations and release capacity on refusal", async () => {
    const pool = new CollectionVerificationPool();
    const bytes = new TextEncoder().encode("test");
    const declarations = [
        {
            id: "sample.txt",
            mediaType: "text/plain",
            byteLength: 4,
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
        },
    ];
    try {
        const pending = pool.assets(declarations, [{ id: "sample.txt", bytes }]);
        bytes.fill(0);
        const verified = await pending;
        expect(await verified[0]!.bytes.text()).toBe("test");
        expect(Object.isFrozen(verified)).toBe(true);
        expect(await failure(pool.assets(declarations, [{ id: "sample.txt", bytes }]))).toMatchObject({
            code: "asset_mismatch",
        });
        expect(await failure(pool.assets(declarations, []))).toMatchObject({ code: "asset_mismatch" });
        expect(await failure(pool.assets(declarations, verified, AbortSignal.abort()))).toMatchObject({
            name: "AbortError",
        });
        expect(pool.stats()).toEqual({ active: false, queued: 0, bytes: 0 });
    } finally {
        await pool.close();
    }
});

async function failure(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error("Expected asset verification to refuse");
}
