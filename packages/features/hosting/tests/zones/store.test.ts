import { expect, test } from "bun:test";
import { InMemoryHostingZoneStore } from "@bernouy/hosting/memory";
import type { HostingZone } from "@bernouy/hosting";

test("zone stores refuse invalid shapes, state jumps and generation changes without mutation", async () => {
    const store = new InMemoryHostingZoneStore();
    const candidate: HostingZone = {
        format: "ulvia-hosting-zone/v1",
        hostname: "demo.example",
        controlInstanceId: "control",
        claimId: crypto.randomUUID(),
        state: "pending",
        revision: 1,
    };
    for (const invalid of [
        { ...candidate, hostname: "DEMO.EXAMPLE" },
        { ...candidate, claimId: "invalid" },
        { ...candidate, extra: true },
        { ...candidate, revision: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
        await expect(store.claimZone(invalid)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    }
    await expect(store.claimZone({ ...candidate, state: "verified" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await store.getZone(candidate.hostname)).toBeNull();
    const pending = await store.claimZone(candidate);
    for (const invalid of [
        { ...pending, controlInstanceId: "foreign", state: "verified" as const, revision: 2 },
        { ...pending, claimId: crypto.randomUUID(), state: "verified" as const, revision: 2 },
        { ...pending, state: "verified" as const, revision: 3 },
    ]) {
        await expect(store.replaceZone(1, invalid)).rejects.toMatchObject({ code: "CONFLICT" });
        expect(await store.getZone(candidate.hostname)).toEqual(pending);
    }
    const disabled = await store.replaceZone(1, { ...pending, state: "disabled", revision: 2 });
    await expect(store.replaceZone(2, { ...disabled, state: "verified", revision: 3 })).rejects.toMatchObject({
        code: "CONFLICT",
    });
    expect(await store.getZone(candidate.hostname)).toEqual(disabled);
});
