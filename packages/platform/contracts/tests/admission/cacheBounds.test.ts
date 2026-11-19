import { expect, test } from "bun:test";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import { StoredReleaseCache } from "ulvia-contracts/core/admission/cache/StoredReleaseCache";
import { fixture, referenceVerification } from "./support";

const bounds = { maxEntries: 2, maxBytes: 1024 * 1024, maxPending: 2, maxPendingBytes: 1024 * 1024 };
const get = (cache: StoredReleaseCache<AdmittedContractRelease>, item: AdmittedContractRelease) =>
    cache.get(item.canonicalJson, item.digest, DEFAULT_RELEASE_LIMITS);

test("entry eviction is LRU and failed loads are removed and retried", async () => {
    const [a, b, c] = await Promise.all([fixture(), fixture({ name: "Other" }), fixture({ name: "Third" })]);
    let loads = 0;
    let fail = false;
    const cache = new StoredReleaseCache(async (...args) => {
        loads += 1;
        if (fail) {
            throw new Error("Unavailable");
        }
        return referenceVerification(...args);
    }, bounds);
    await get(cache, a);
    await get(cache, b);
    await get(cache, a);
    await get(cache, c);
    expect(loads).toBe(3);
    expect(cache.snapshot().entries).toBe(2);
    await get(cache, a);
    expect(loads).toBe(3);
    fail = true;
    await expect(get(cache, b)).rejects.toThrow("Unavailable");
    expect(cache.snapshot().pending).toBe(0);
    expect(cache.snapshot().pendingBytes).toBe(0);
    fail = false;
    await get(cache, b);
    expect(loads).toBe(5);
});

test("retained content byte bounds evict entries and oversized admissions leave small hits intact", async () => {
    const [a, b, large] = await Promise.all([
        fixture(),
        fixture({ name: "Other" }),
        fixture({ name: "Long".repeat(32) }),
    ]);
    const calibration = new StoredReleaseCache(referenceVerification, bounds);
    await get(calibration, a);
    const bytes = calibration.snapshot().bytes;
    const cache = new StoredReleaseCache(referenceVerification, { ...bounds, maxEntries: 8, maxBytes: bytes * 2 - 1 });
    await get(cache, a);
    await get(cache, b);
    expect(cache.snapshot().entries).toBe(1);
    expect(cache.snapshot().bytes).toBeLessThanOrEqual(bytes * 2 - 1);
    let loads = 0;
    const small = new StoredReleaseCache(
        async (...args) => {
            loads += 1;
            return referenceVerification(...args);
        },
        { ...bounds, maxBytes: bytes },
    );
    await get(small, a);
    await get(small, large);
    await get(small, a);
    expect(loads).toBe(2);
    expect(small.snapshot()).toMatchObject({ entries: 1, bytes });
});

test("pending count saturation runs ordinary verification without retaining more inputs", async () => {
    const [a, b] = await Promise.all([fixture(), fixture({ name: "Other" })]);
    const deferred = Promise.withResolvers<AdmittedContractRelease>();
    let loads = 0;
    const cache = new StoredReleaseCache(
        async (...args) => {
            loads += 1;
            return loads === 1 ? deferred.promise : referenceVerification(...args);
        },
        { ...bounds, maxPending: 1 },
    );
    const first = get(cache, a);
    const shared = get(cache, a);
    await Promise.resolve();
    expect(cache.snapshot().pending).toBe(1);
    expect((await get(cache, b)).digest).toBe(b.digest);
    expect(cache.snapshot().pending).toBe(1);
    expect(cache.snapshot().entries).toBe(0);
    deferred.resolve(a);
    expect(await first).toBe(await shared);
    expect(loads).toBe(2);
    expect(cache.snapshot()).toMatchObject({ pending: 0, pendingBytes: 0, entries: 1 });
});

test("pending byte saturation does not cache inputs or turn valid requests into refusals", async () => {
    const a = await fixture();
    let loads = 0;
    const cache = new StoredReleaseCache(
        async (...args) => {
            loads += 1;
            return referenceVerification(...args);
        },
        { ...bounds, maxPendingBytes: 1 },
    );
    const values = await Promise.all([get(cache, a), get(cache, a)]);
    expect(values.map((value) => value.digest)).toEqual([a.digest, a.digest]);
    expect(loads).toBe(2);
    expect(cache.snapshot()).toEqual({ entries: 0, bytes: 0, pending: 0, pendingBytes: 0 });
});

test("cache bounds reject invalid configuration", () => {
    for (const key of Object.keys(bounds)) {
        for (const value of [0, -1, Infinity, 1.5, NaN]) {
            expect(() => new StoredReleaseCache(referenceVerification, { ...bounds, [key]: value })).toThrow(
                "positive safe integers",
            );
        }
    }
});
