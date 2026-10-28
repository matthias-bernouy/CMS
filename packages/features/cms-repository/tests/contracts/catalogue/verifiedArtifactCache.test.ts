import { expect, test } from "bun:test";
import { VerifiedArtifactCache } from "cms-repository/contracts/core/catalogue/VerifiedArtifactCache";

test("verified immutable cache shares pending reads, retries failures and stays within LRU entry/byte budgets", async () => {
    const cache = new VerifiedArtifactCache<{ canonicalJson: string }>(2, 12);
    let reads = 0;
    const deferred = Promise.withResolvers<{ canonicalJson: string }>();
    const load = () => {
        reads++;
        return deferred.promise;
    };
    const one = cache.get("a", load);
    const two = cache.get("a", load);
    deferred.resolve(Object.freeze({ canonicalJson: "aaa" }));
    expect(await one).toBe(await two);
    expect(reads).toBe(1);
    await cache.get("b", async () => ({ canonicalJson: "bbb" }));
    expect(cache.peek("a")).toBeDefined();
    await cache.get("c", async () => ({ canonicalJson: "ccc" }));
    expect(cache.peek("b")).toBeUndefined();
    expect(cache.peek("a")).toBeDefined();
    await cache.get("large", async () => ({ canonicalJson: "oversized" }));
    expect(cache.peek("large")).toBeUndefined();
    await expect(
        cache.get("failed", async () => {
            throw new Error("unavailable");
        }),
    ).rejects.toThrow("unavailable");
    expect(await cache.get("failed", async () => ({ canonicalJson: "ok" }))).toEqual({ canonicalJson: "ok" });
    expect(new VerifiedArtifactCache().peek("a")).toBeUndefined();
});
