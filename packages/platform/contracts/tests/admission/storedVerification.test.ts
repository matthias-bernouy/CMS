import { expect, test } from "bun:test";
import { DEFAULT_RELEASE_LIMITS, verifyStoredContractReleaseJson } from "@bernouy/ulvia-contracts";
import { StoredReleaseCache } from "ulvia-contracts/core/admission/cache/StoredReleaseCache";
import { fixture, outcome, referenceVerification } from "./support";

const encoder = new TextEncoder();

test("stored verification shares exact immutable bytes without trusting a supplied digest alone", async () => {
    const admitted = await fixture();
    let calls = 0;
    const cache = new StoredReleaseCache(async (input, digest, limits) => {
        calls += 1;
        return referenceVerification(input, digest, limits);
    });
    const first = cache.get(admitted.canonicalJson, admitted.digest, DEFAULT_RELEASE_LIMITS);
    const second = cache.get(encoder.encode(admitted.canonicalJson), admitted.digest, DEFAULT_RELEASE_LIMITS);
    expect(await first).toBe(await second);
    expect(calls).toBe(1);
    const changed = admitted.canonicalJson.replace('"Email"', '"Changed"');
    await expect(cache.get(changed, admitted.digest, DEFAULT_RELEASE_LIMITS)).rejects.toThrow("digest mismatch");
    await expect(cache.get(admitted.canonicalJson, `sha256:${"0".repeat(64)}`, DEFAULT_RELEASE_LIMITS)).rejects.toThrow(
        "digest mismatch",
    );
    expect(cache.snapshot().entries).toBe(1);
    expect(cache.snapshot().pending).toBe(0);
    expect(await cache.get(admitted.canonicalJson, admitted.digest, DEFAULT_RELEASE_LIMITS)).toBe(await first);
    expect(calls).toBe(3);
});

test("mutable input and policy changes cannot poison pending admissions", async () => {
    const admitted = await fixture();
    const cache = new StoredReleaseCache(referenceVerification);
    const input = encoder.encode(admitted.canonicalJson);
    const policy = { ...DEFAULT_RELEASE_LIMITS };
    const pending = cache.get(input, admitted.digest, policy);
    input.fill(0);
    policy.maxDocumentBytes = 1;
    expect((await pending).digest).toBe(admitted.digest);
    await expect(cache.get(input, admitted.digest, DEFAULT_RELEASE_LIMITS)).rejects.toThrow();
    await expect(cache.get(admitted.canonicalJson, admitted.digest, policy)).rejects.toThrow("document exceeds");
});

test("every release limit participates in the cache identity", async () => {
    const admitted = await fixture();
    let calls = 0;
    const cache = new StoredReleaseCache(async (input, digest, limits) => {
        calls += 1;
        return referenceVerification(input, digest, limits);
    });
    await cache.get(admitted.canonicalJson, admitted.digest, DEFAULT_RELEASE_LIMITS);
    for (const key of Object.keys(DEFAULT_RELEASE_LIMITS) as (keyof typeof DEFAULT_RELEASE_LIMITS)[]) {
        const policy = { ...DEFAULT_RELEASE_LIMITS, [key]: DEFAULT_RELEASE_LIMITS[key] + 1 };
        await cache.get(admitted.canonicalJson, admitted.digest, policy);
        await cache.get(admitted.canonicalJson, admitted.digest, policy);
    }
    expect(calls).toBe(1 + Object.keys(DEFAULT_RELEASE_LIMITS).length);
    await expect(
        cache.get(admitted.canonicalJson, admitted.digest, { ...DEFAULT_RELEASE_LIMITS, maxCapabilities: 0 }),
    ).rejects.toThrow();
});

test("cached public admissions stay deeply frozen and contain the same execution plan", async () => {
    const admitted = await fixture();
    const first = await verifyStoredContractReleaseJson(admitted.canonicalJson, admitted.digest);
    const again = await verifyStoredContractReleaseJson(admitted.canonicalJson, admitted.digest);
    expect(again).toBe(first);
    expect(first).toEqual(admitted);
    expect(Object.isFrozen(first.release.capabilities[0]?.input)).toBe(true);
    expect(Object.isFrozen(first.bindings[0]?.binding.response)).toBe(true);
    expect(Reflect.set(first.release, "name", "Corrupted")).toBe(false);
    expect(first.release.name).toBe("Email");
});

test("malformed persisted inputs preserve all original refusals even after a valid cache hit", async () => {
    const admitted = await fixture();
    await verifyStoredContractReleaseJson(admitted.canonicalJson, admitted.digest);
    const inputs = [
        "",
        "{",
        `${admitted.canonicalJson} false`,
        admitted.canonicalJson.replace('"name":"Email"', '"name":"Email","name":"Other"'),
        `\ufeff${admitted.canonicalJson}`,
        encoder.encode(`\ufeff${admitted.canonicalJson}`),
        new Uint8Array([0xff]),
        new Uint8Array([0xc3, 0x28]),
        admitted.canonicalJson.replace('"Email"', '"\ud800"'),
        admitted.canonicalJson.replace('"Email"', '"\ufffd"'),
        ` \n${admitted.canonicalJson}\n `,
    ];
    for (const input of inputs) {
        for (const digest of [admitted.digest, null, "not-a-digest"]) {
            expect(await outcome(input, digest, DEFAULT_RELEASE_LIMITS, verifyStoredContractReleaseJson)).toEqual(
                await outcome(input, digest, DEFAULT_RELEASE_LIMITS),
            );
        }
    }
});
