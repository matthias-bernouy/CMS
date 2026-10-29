import { expect } from "bun:test";
import { docker } from "../containers";

/** Real Mongo evidence: durable batching, conflict fences, races and tenant isolation. */
export async function exerciseBulkJournal(providerName: string, stackId: string) {
    const database = `ulvia_journal_${stackId.replaceAll("-", "_")}`;
    const script = `
        import { strict as assert } from "node:assert";
        import { MongoClient } from "mongodb";
        import { MongoJournalStore } from "@bernouy/cms-observability/mongo";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        const name = ${JSON.stringify(database)};
        assert.match(name, /^ulvia_journal_[a-z0-9_]+$/);
        const client = new MongoClient(readProviderRuntimeEnv(process.env).MONGO_URL, { monitorCommands: true });
        const commands = [];
        client.on("commandStarted", event => commands.push(event.commandName));
        await client.connect();
        const db = client.db(name);
        try {
            const store = new MongoJournalStore(db);
            await store.init();
            const now = new Date().toISOString();
            const row = (id, instanceId = "a") => ({ id, instanceId, fingerprint: id, service: "test",
                level: "info", event: "journal.test", attributes: {}, time: now, receivedAt: now,
                expiresAt: new Date(Date.now() + 60_000).toISOString() });
            assert.equal((await db.collection("cms_observability_entries").indexes()).length, 12);
            const entries = Array.from({ length: 15 }, (_, i) => row(String(i)));
            commands.length = 0;
            const start = performance.now();
            assert.deepEqual(await store.append(entries), { stored: 15, duplicates: 0 });
            const coldDurationMs = performance.now() - start;
            assert.deepEqual(commands, ["update"]);
            assert.deepEqual(await store.append(entries), { stored: 0, duplicates: 15 });
            assert.deepEqual(await store.append([row("repeat"), row("repeat")]), { stored: 1, duplicates: 1 });
            assert.deepEqual(await store.append([row("0", "b")]), { stored: 1, duplicates: 0 });
            await assert.rejects(store.append([{ ...row("0"), fingerprint: "conflict" }]), /ENTRY_CONFLICT/);
            assert.equal((await store.get("a", "0", now)).fingerprint, "0");
            await assert.rejects(store.append([row("never"), { ...row("never"), fingerprint: "conflict" }]), /ENTRY_CONFLICT/);
            assert.equal(await store.get("a", "never", now), null);
            const races = await Promise.all(Array.from({ length: 8 }, () => store.append([row("race")])));
            assert.equal(races.reduce((n, result) => n + result.stored, 0), 1);
            assert.equal(races.reduce((n, result) => n + result.duplicates, 0), 7);
            const times = [];
            for (let batch = 0; batch < 10; batch++) {
                commands.length = 0;
                const start = performance.now();
                const result = await store.append(entries.map(entry => ({ ...entry, id: "batch-" + batch + "-" + entry.id })));
                times.push(performance.now() - start);
                assert.deepEqual(result, { stored: 15, duplicates: 0 });
                assert.deepEqual(commands, ["update"]);
            }
            console.log(JSON.stringify({ batchOperations: 1, entries: 15, coldDurationMs,
                p50Ms: times.sort((a, b) => a - b)[5], indexes: 12, isolated: true }));
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
    const report = JSON.parse(result.stdout.trim());
    expect(report).toMatchObject({ batchOperations: 1, entries: 15, isolated: true });
    return report;
}
