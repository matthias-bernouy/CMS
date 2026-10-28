import { expect } from "bun:test";
import { docker } from "../containers";

/** Exercise atomic delegation persistence against the disposable stack's real MongoDB. */
export async function exerciseDelegationStore(providerName: string, stackId: string) {
    const database = `ulvia_delegation_${stackId.replaceAll("-", "_")}`;
    const script = `
        import { strict as assert } from "node:assert";
        import { createHash } from "node:crypto";
        import { MongoClient } from "mongodb";
        import { MongoDelegationStore } from "@bernouy/cms-gateway/access/delegation/mongo";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        const name = ${JSON.stringify(database)};
        assert.match(name, /^ulvia_delegation_[a-z0-9_]+$/);
        const client = new MongoClient(readProviderRuntimeEnv(process.env).MONGO_URL);
        await client.connect();
        const db = client.db(name);
        try {
            const store = new MongoDelegationStore(db);
            await store.init();
            const now = Date.now();
            const rawTicket = "opaque-test-ticket-never-persisted";
            const hash = createHash("sha256").update(rawTicket).digest("hex");
            const record = { hash, siteId: "site-a", source: {
                siteId: "site-a", requestId: crypto.randomUUID(), installationId: "origin",
                contractId: "example.source", version: "1.0.0", digest: "sha256:" + "a".repeat(64),
                capabilityId: "render", actor: { kind: "anonymous" }, deadline: now + 30000,
            }, installationFingerprint: "installation", credentialFingerprint: "b".repeat(64), selectionFingerprint: "selection", actorFingerprint: "anonymous", expiresAt: now + 30000 };
            assert.equal(await store.create(record, now), true);
            assert.equal(await store.create(record, now), false);
            assert.equal(await store.get("site-b", hash, now), null);
            assert.equal(await store.get("site-a", hash, record.expiresAt), null);
            const consumed = await Promise.all(Array.from({ length: 40 }, () => store.consume("site-a", hash, now, 0)));
            assert.equal(consumed.filter(Boolean).length, 32);
            const restarted = new MongoDelegationStore(db);
            assert.equal((await restarted.get("site-a", hash, now)).source.requestId, record.source.requestId);
            assert.equal(await restarted.consume("site-a", hash, now, 0), false);
            await restarted.close("site-b", hash, record.source.requestId);
            await restarted.close("site-a", hash, "wrong-root");
            assert.ok(await restarted.get("site-a", hash, now));
            await restarted.close("site-a", hash, record.source.requestId);
            assert.equal(await restarted.get("site-a", hash, now), null);
            const byteRecord = { ...record, hash: "byte-budget" };
            assert.equal(await store.create(byteRecord, now), true);
            assert.equal(await store.consume("site-a", byteRecord.hash, now, 4 * 1024 * 1024), true);
            assert.equal(await store.consume("site-a", byteRecord.hash, now, 1), false);
            assert.equal(await store.consume("site-a", byteRecord.hash, now, -1), false);
            const capacity = await Promise.all(Array.from({ length: 260 }, (_, index) => store.create({ ...record, hash: "capacity-" + index }, now)));
            assert.equal(capacity.filter(Boolean).length, 255);
            const other = { ...record, siteId: "site-b", hash: "capacity-0" };
            assert.equal(await store.create(other, now), true);
            assert.equal((await store.get("site-b", "capacity-0", now)).siteId, "site-b");
            await store.close("site-b", "capacity-0", other.source.requestId);
            assert.equal(await store.get("site-b", "capacity-0", now), null);
            assert.ok(await store.get("site-a", "capacity-0", now));
            const saved = JSON.stringify(await db.collection("gateway_delegations").findOne({ _id: "site-a" }));
            assert.equal(saved.includes(rawTicket), false);
            assert.equal((await db.collection("gateway_delegations").indexes()).some((index) => index.expireAfterSeconds === 0), true);
            console.log(JSON.stringify({ concurrentCalls: 32, activeTickets: 256, persistedRawTicket: false }));
        } finally { await db.dropDatabase(); await client.close(); }
    `;
    const result = await docker([
        "exec",
        "--workdir",
        "/app/packages/runtimes/ulvia-provider-server",
        providerName,
        "bun",
        "--no-macros",
        "-e",
        script,
    ]);
    expect(JSON.parse(result.stdout.trim())).toEqual({
        concurrentCalls: 32,
        activeTickets: 256,
        persistedRawTicket: false,
    });
}
