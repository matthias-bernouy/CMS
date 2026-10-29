import { test, expect } from "bun:test";
import { DeferredDelegationStore } from "cms-gateway/access/delegation/authority/DeferredDelegationStore";
import { InMemoryDelegationStore, DelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { DelegationRecord, DelegationStore } from "@bernouy/cms-gateway/access/delegation";
import { delegationFixture } from "../fixtures";
const now = Date.now();
const record = (hash = "hash", siteId = "site-a"): DelegationRecord => ({
    hash,
    siteId,
    source: {
        siteId,
        requestId: hash,
        installationId: "origin-install",
        contractId: "origin",
        version: "1.0.0",
        digest: "sha256:x",
        capabilityId: "item.list",
        actor: { kind: "anonymous" },
        deadline: now + 30_000,
    },
    installationFingerprint: "installation",
    credentialFingerprint: "credential",
    selectionFingerprint: "selection",
    actorFingerprint: "actor",
    expiresAt: now + 30_000,
});
function fixture() {
    const durable = new InMemoryDelegationStore();
    let creates = 0,
        consumes = 0,
        closes = 0;
    let beforeCreate = async () => {};
    const wrapped: DelegationStore = {
        get: (...args) => durable.get(...args),
        create: async (...args) => {
            creates++;
            await beforeCreate();
            return durable.create(...args);
        },
        consume: async (...args) => {
            consumes++;
            return durable.consume(...args);
        },
        close: async (...args) => {
            closes++;
            await durable.close(...args);
        },
    };
    const store = new DeferredDelegationStore("site-a", wrapped);
    return {
        store,
        durable,
        counts: () => ({ creates, consumes, closes }),
        setBeforeCreate: (fn: () => Promise<void>) => {
            beforeCreate = fn;
        },
    };
}
test("unused roots close without a durable write; cross-instance and wrong-request calls cannot close a reservation", async () => {
    const f = fixture();
    await f.store.create(record(), now);
    await f.store.close("site-b", "hash", "hash");
    await f.store.close("site-a", "hash", "wrong");
    expect(await f.store.get("site-a", "hash", now)).not.toBeNull();
    expect(await f.store.get("site-b", "hash", now)).toBeNull();
    expect(await f.store.consume("site-b", "hash", now, 1)).toBe(false);
    await f.store.close("site-a", "hash", "hash");
    expect(await f.store.get("site-a", "hash", now)).toBeNull();
    expect(f.counts()).toEqual({ creates: 0, consumes: 0, closes: 0 });
});
test("first consumers share one persistence operation and retain the existing atomic 32-call quota", async () => {
    const f = fixture();
    await f.store.create(record(), now);
    const results = await Promise.all(Array.from({ length: 40 }, () => f.store.consume("site-a", "hash", now, 1)));
    expect(results.filter(Boolean)).toHaveLength(32);
    expect(f.counts().creates).toBe(1);
    await f.store.close("site-a", "hash", "hash");
    expect(await f.store.consume("site-a", "hash", now, 1)).toBe(false);
    expect(await f.durable.get("site-a", "hash", now)).toBeNull();
});
test("close during first persistence refuses consumption and cannot resurrect the root", async () => {
    const f = fixture(),
        barrier = Promise.withResolvers<void>();
    f.setBeforeCreate(() => barrier.promise);
    await f.store.create(record(), now);
    const consuming = f.store.consume("site-a", "hash", now, 1);
    await Promise.resolve();
    const closing = f.store.close("site-a", "hash", "hash");
    expect(await f.store.get("site-a", "hash", now)).toBeNull();
    barrier.resolve();
    expect(await consuming).toBe(false);
    await closing;
    expect(await f.store.get("site-a", "hash", now)).toBeNull();
    expect(f.counts()).toEqual({ creates: 1, consumes: 0, closes: 1 });
});
test("failed persistence, expiry and invalid bytes never grant a delegated call", async () => {
    const f = fixture();
    await f.store.create(record(), now);
    for (const bytes of [-1, Infinity, 4 * 1024 * 1024 + 1]) {
        expect(await f.store.consume("site-a", "hash", now, bytes)).toBe(false);
    }
    expect(await f.store.consume("site-a", "hash", now + 30_000, 1)).toBe(false);
    expect(f.counts().creates).toBe(0);
    f.setBeforeCreate(async () => {
        throw new Error("durability unavailable");
    });
    await expect(f.store.consume("site-a", "hash", now, 1)).rejects.toThrow("durability unavailable");
    await expect(f.store.get("site-a", "hash", now)).rejects.toThrow();
});
test("reservations are bounded, expire, and a process restart refuses unconsumed tickets", async () => {
    const f = fixture();
    for (let i = 0; i < 256; i++) {
        expect(await f.store.create(record(String(i)), now)).toBe(true);
    }
    expect(await f.store.create(record("overflow"), now)).toBe(false);
    expect(await new DeferredDelegationStore("site-a", f.durable).get("site-a", "0", now)).toBeNull();
    expect(await f.store.create({ ...record("new"), expiresAt: now + 60_000 }, now + 30_001)).toBe(true);
});
for (const change of ["role", "credential", "selection", "inactive"] as const) {
    test(`deferred roots preserve live ${change} checks before materialization`, async () => {
        const f = await delegationFixture();
        const store = new DeferredDelegationStore("site-a", f.store);
        const authority = new DelegationAuthority({
            siteId: "site-a",
            routes: f.routes,
            selections: f.selections,
            store,
            now: () => f.state.now,
            inspectActor: async () => (f.state.actorActive ? f.state.actor : null),
            credentialFingerprint: async () => f.state.credential,
        });
        const ticket = await authority.issue(f.root());
        expect(ticket).not.toBeNull();
        if (change === "role") {
            f.state.actor = { kind: "user", subjectId: "user", authorizationRevision: 2 };
        }
        if (change === "credential") {
            f.state.credential = "changed";
        }
        if (change === "selection") {
            f.state.current.revision++;
        }
        if (change === "inactive") {
            f.state.actorActive = false;
        }
        await expect(authority.authorize(f.child(ticket!.ticket), 1)).rejects.toThrow();
    });
}
