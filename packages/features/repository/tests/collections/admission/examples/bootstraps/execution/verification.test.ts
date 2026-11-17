import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { admitCollectionRelease, DEFAULT_COLLECTION_LIMITS } from "@bernouy/repository/collections";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import { collectionVerificationScope } from "repository/collections/sources/verificationScope";
import { bootstrapCollection } from "../fixture";
import { MemoryCollectionStorage } from "@bernouy/repository/collections/installations";
import { assertCollectionResourceIsolation } from "repository/collections/installations/core/resourceIsolation";

async function fixture() {
    const source = bootstrapCollection();
    const bytes = new TextEncoder().encode("test");
    source.assets = [
        {
            id: "sample.txt",
            mediaType: "text/plain",
            byteLength: 4,
            digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        },
    ];
    const artifact = await admitCollectionRelease(source, [{ id: "sample.txt", bytes }]);
    let calls = 0;
    const base = {
        ...inlineCollectionVerifier,
        metadata: async (...args: Parameters<typeof inlineCollectionVerifier.metadata>) => {
            calls++;
            return inlineCollectionVerifier.metadata(...args);
        },
    };
    return {
        artifact,
        bytes,
        base,
        calls: () => calls,
        scope: collectionVerificationScope(base, 16, 32 * 1024 * 1024),
    };
}

test("preparation evidence reuses immutable outputs only, with exact digest and complete limit identity", async () => {
    const f = await fixture();
    const verified = await f.scope.metadata(f.artifact.release, f.artifact.digest);
    expect(await f.scope.metadata(verified.release, verified.digest)).toBe(verified);
    expect(f.calls()).toBe(1);
    await f.scope.metadata(structuredClone(verified.release), verified.digest);
    expect(f.calls()).toBe(2);
    await expect(f.scope.metadata(verified.release, `sha256:${"0".repeat(64)}`)).rejects.toThrow("digest mismatch");
    await expect(
        f.scope.metadata(verified.release, verified.digest, undefined, {
            ...DEFAULT_COLLECTION_LIMITS,
            maxDocumentBytes: 1,
        }),
    ).rejects.toThrow();
    await expect(f.scope.metadata(verified.release, verified.digest, AbortSignal.abort())).rejects.toThrow();
    const nextRequest = collectionVerificationScope(f.base, 16, 32 * 1024 * 1024);
    const before = f.calls();
    await nextRequest.metadata(verified.release, verified.digest);
    expect(f.calls()).toBe(before + 1);
    expect(Object.isFrozen(verified.release.bootstraps?.[0])).toBe(true);
});

test("verified metadata never exempts assets from exact-set, digest, snapshot or cancellation checks", async () => {
    const f = await fixture();
    const verified = await f.scope.metadata(f.artifact.release, f.artifact.digest);
    const promise = f.scope.artifact(verified.release, [{ id: "sample.txt", bytes: f.bytes }], verified.digest);
    f.bytes.fill(0);
    const result = await promise;
    expect(await result.assets[0]!.bytes.text()).toBe("test");
    expect(f.calls()).toBe(1);
    await expect(
        f.scope.artifact(verified.release, [{ id: "sample.txt", bytes: f.bytes }], verified.digest),
    ).rejects.toThrow("digest mismatch");
    await expect(f.scope.artifact(verified.release, [], verified.digest)).rejects.toThrow("asset set");
    await expect(
        f.scope.artifact(verified.release, result.assets, verified.digest, AbortSignal.abort()),
    ).rejects.toThrow();
    const forged = { ...structuredClone(verified.release), version: "1.2.3" };
    await expect(f.scope.artifact(forged, result.assets, verified.digest)).rejects.toThrow("digest mismatch");
});

test("failed verification is never retained and request evidence obeys its retention budget", async () => {
    const f = await fixture();
    const forged = { ...structuredClone(f.artifact.release), version: "1.2.3" };
    await expect(f.scope.metadata(forged, f.artifact.digest)).rejects.toThrow();
    await expect(f.scope.metadata(forged, f.artifact.digest)).rejects.toThrow();
    expect(f.calls()).toBe(2);
    const disabled = collectionVerificationScope(f.base, 1, 1);
    const verified = await disabled.metadata(f.artifact.release, f.artifact.digest);
    const before = f.calls();
    await disabled.metadata(verified.release, verified.digest);
    expect(f.calls()).toBe(before + 1);
});

test("graph reuse requires issuer-owned immutable releases and memory metadata preserves that identity", async () => {
    const f = await fixture();
    const verified = await f.scope.metadata(f.artifact.release, f.artifact.digest);
    f.scope.validateResources([verified.release]);
    f.scope.validateResources([verified.release]);
    expect(() => f.scope.validateResources([verified.release, verified.release])).toThrow("already belongs");
    const changed = {
        ...structuredClone(verified.release),
        examples: verified.release.examples!.map((example) => ({
            ...example,
            document: { html: '<div cms-bloc="unknown--bloc"></div>' },
        })),
    };
    expect(() => f.scope.validateResources([changed])).toThrow();
    const storage = new MemoryCollectionStorage(undefined, f.scope);
    await storage.putRelease({
        digest: verified.digest,
        release: verified.release,
        assets: [{ id: "sample.txt", bytes: f.bytes }],
    });
    const stored = await storage.getReleaseMetadata(verified.digest);
    expect(stored?.release).toBe(verified.release);
    expect(Object.isFrozen(stored)).toBe(true);
    const copy = await storage.getRelease(verified.digest);
    Object.assign(copy!.release, { version: "9.0.0" });
    copy!.assets[0]!.bytes.fill(0);
    expect((await storage.getReleaseMetadata(verified.digest))?.release.version).toBe(verified.release.version);
    expect(await new Blob([await storage.getAsset(verified.digest, "sample.txt")!]).text()).toBe("test");
});

test("singleton admission evidence never exempts unresolved dependencies or copied input from graph checks", async () => {
    const source = bootstrapCollection();
    source.dependencies = [
        {
            publisherId: "other",
            collectionId: "other/library",
            versionRange: "^1.0.0",
            imports: { blocs: [], themeTokens: [], texts: [], assets: [{ id: "missing.txt" }], states: [] },
        },
    ];
    const artifact = await admitCollectionRelease(source);
    const scope = collectionVerificationScope(inlineCollectionVerifier, 16, 32 * 1024 * 1024);
    const verified = await scope.metadata(artifact.release, artifact.digest);
    expect(() => scope.validateResources([verified.release])).toThrow("requires other/library");
    expect(() => assertCollectionResourceIsolation([verified.release])).toThrow("requires other/library");
    const closed = await fixture();
    const admitted = await closed.scope.metadata(closed.artifact.release, closed.artifact.digest);
    expect(() => assertCollectionResourceIsolation([admitted.release])).not.toThrow();
    expect(() => closed.scope.validateResources([admitted.release])).not.toThrow();
    const copy = structuredClone(admitted.release);
    copy.blocs = [...copy.blocs, copy.blocs[0]!];
    expect(() => closed.scope.validateResources([copy])).toThrow("already belongs");
});
