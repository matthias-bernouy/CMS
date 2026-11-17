import { expect, test } from "bun:test";
import { InitializationArtifacts } from "repository/collections/installations/initialization/execution/preparation/reuse/artifacts";
import { InitializationPreparationCache } from "repository/collections/installations/initialization/execution/preparation/reuse/preparations";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import { initializationFixture } from "../fixture";

test("artifact retention is bounded, rejects forged input and clears when its verifier changes", async () => {
    const f = await initializationFixture();
    const cache = new InitializationArtifacts(1024 * 1024, 1);
    const verifier = cache.verifier(inlineCollectionVerifier);
    cache.remember(f.artifact);
    expect(cache.stats().entries).toBe(1);
    const forged = { ...structuredClone(f.artifact.release), version: "9.0.0" };
    await expect(verifier.metadata(forged, f.artifact.digest)).rejects.toThrow("digest mismatch");
    const other = await initializationFixture("another-instance", 2);
    cache.remember(other.artifact);
    expect(cache.stats().entries).toBe(1);
    expect(cache.stats().bytes).toBeLessThanOrEqual(1024 * 1024);
    expect(cache.get(f.root)).toBeUndefined();
    expect(cache.get(other.root)?.artifact?.digest).toBe(other.artifact.digest);
    cache.verifier({ ...inlineCollectionVerifier });
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0 });
    const small = new InitializationArtifacts(1, 1);
    small.remember(f.artifact);
    expect(small.stats()).toEqual({ entries: 0, bytes: 0 });
    expect(() => new InitializationArtifacts(0, 1)).toThrow("retention limit");
});

test("validated plans have independent count and byte bounds and cannot retain evicted artifact payloads", async () => {
    const f = await initializationFixture();
    const { plan } = await f.service.plan("admin", f.root);
    const cache = new InitializationPreparationCache();
    cache.artifacts.verifier(inlineCollectionVerifier);
    cache.artifacts.remember(f.artifact);
    for (const key of ["a", "b", "c"]) {
        cache.remember(key, plan);
    }
    expect(cache.stats().entries).toBe(2);
    expect(cache.stats().bytes).toBeLessThanOrEqual(512 * 1024);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(plan);
    cache.artifacts.verifier({ ...inlineCollectionVerifier });
    expect(cache.get("b")).toBeUndefined();
    cache.remember("oversized", { ...plan, pages: Array(100_000).fill(plan.pages[0]) });
    expect(cache.stats().entries).toBe(2);
});
