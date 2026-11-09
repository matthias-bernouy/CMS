import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import type { CommandStartedEvent, Db } from "mongodb";
import { MongoProviderInstanceRegistry } from "../../../src/runtime/instances/MongoProviderInstanceRegistry";
import { MongoInstanceTransitionStore } from "../../../src/runtime/instances/MongoInstanceTransitionStore";
import { MongoProviderOperationStore } from "../../../src/runtime/provider-operations/MongoProviderOperationStore";

const url = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = url ? test : test.skip;
let client: MongoClient;
let db: Db;
let instances: MongoProviderInstanceRegistry;
let transitions: MongoInstanceTransitionStore;
const commands: CommandStartedEvent[] = [];
const batches: Array<{ namespace: string; count: number; bytes: number }> = [];
const digest = `sha256:${"a".repeat(64)}`;
const plan = { manifest: { providerId: "ulvia/primary-provider", version: "1.4.0", digest }, contracts: [] };
beforeAll(async () => {
    if (!url) {
        return;
    }
    client = new MongoClient(url, { monitorCommands: true });
    client.on("commandStarted", (event) => commands.push(event));
    client.on("commandSucceeded", (event) => {
        const cursor = event.reply?.cursor;
        const values = cursor?.firstBatch ?? cursor?.nextBatch;
        if (Array.isArray(values)) {
            batches.push({
                namespace: cursor.ns,
                count: values.length,
                bytes: Buffer.byteLength(JSON.stringify(values)),
            });
        }
    });
    await client.connect();
    db = client.db(`ulvia_startup_scan_${crypto.randomUUID().replaceAll("-", "")}`);
    instances = new MongoProviderInstanceRegistry(db);
    transitions = new MongoInstanceTransitionStore(db);
    await Promise.all([instances.init(), transitions.init()]);
    for (let index = 0; index < 101; index++) {
        const name = `scan-${String(index).padStart(3, "0")}`;
        await instances.create({
            repository: { url: "https://repo.ulvia.fr", configured: false },

            id: `instance:${name}`,
            storageKey: name,
            idempotencyKey: name,
            idempotencyFingerprint: digest,
            creationAuthority: { kind: "operator" },
            label: name,
            cmsUrl: `http://${name}.localhost`,
            gatewayUrl: `http://${name}.localhost`,
            status: "ready",
            systemPlan: plan,
        });
        await transitions.createOrGet({
            id: `upgrade:${name}`,
            instanceId: "instance:scan-000",
            kind: "upgrade",
            sourcePlan: plan,
            targetPlan: plan,
            planVersion: 1,
            steps: ["manifest"],
            completedSteps: index === 100 ? ["manifest"] : [],
            status: index === 100 ? "succeeded" : "queued",
        });
    }
});
afterAll(async () => {
    if (client) {
        await db.dropDatabase();
        await client.close();
    }
});

integration("startup scans use batches of at most 50 records and close a partially consumed cursor", async () => {
    commands.length = 0;
    batches.length = 0;
    let count = 0;
    for await (const instance of instances.scan()) {
        expect(instance.id).toMatch(/^instance:scan-/u);
        count++;
    }
    expect(count).toBe(101);
    expect(batches.every((batch) => batch.count <= 50 && batch.bytes < 128 * 1024)).toBeTrue();
    expect(commands.filter(({ commandName }) => commandName === "find")).toHaveLength(1);
    expect(
        commands
            .filter(({ commandName }) => commandName === "getMore")
            .every(({ command }) => command.batchSize === 50),
    ).toBeTrue();
    commands.length = 0;
    for await (const _instance of instances.scan()) {
        break;
    }
    expect(commands.some(({ commandName }) => commandName === "killCursors")).toBeTrue();
    expect(commands.some(({ commandName }) => commandName === "getMore")).toBeFalse();
});

integration(
    "retention streams unfinished transitions through the status index without reading succeeded history",
    async () => {
        commands.length = 0;
        batches.length = 0;
        let count = 0;
        for await (const transition of transitions.scanRetained("instance:scan-000")) {
            expect(transition.status).toBe("queued");
            count++;
        }
        expect(count).toBe(100);
        expect(batches.every((batch) => batch.count <= 50 && batch.bytes < 128 * 1024)).toBeTrue();
        expect(await transitions.hasUnstagedUpgrade("instance:scan-000")).toBeTrue();
        expect(await transitions.hasUnstagedUpgrade("instance:scan-001")).toBeFalse();
        const plan = await db
            .collection("ulvia_provider_instance_transitions")
            .find({ status: { $ne: "succeeded" }, instanceId: "instance:scan-000" })
            .sort({ status: 1, instanceId: 1, _id: 1 })
            .explain("executionStats");
        expect(plan.executionStats.totalDocsExamined).toBe(100);
        expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain("COLLSCAN");
    },
);

integration("startup pending probe retains unexpired running work and returns only one identifier", async () => {
    const store = new MongoProviderOperationStore(db);
    await store.init();
    expect(await store.hasPending()).toBeFalse();
    const now = new Date().toISOString();
    await store.createOrGet({
        id: "pending",
        siteId: "default",
        contractId: "ulvia/cms.installations",
        capabilityId: "initialization.apply",
        idempotencyKey: "pending",
        inputDigest: digest,
        input: { source: "x".repeat(500_000) },
        context: {
            siteId: "default",
            providerId: plan.manifest.providerId,
            requestId: crypto.randomUUID(),
            contractVersion: "1.1.0",
        },
        status: "running",
        revision: 1,
        createdAt: now,
        updatedAt: now,
        lease: { token: "test-pending-lease", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(await store.listRecoverable(now, 1)).toEqual([]);
    commands.length = 0;
    batches.length = 0;
    expect(await store.hasPending()).toBeTrue();
    expect(commands).toHaveLength(1);
    expect(commands[0]?.command).toMatchObject({
        find: "ulvia_provider_operations",
        projection: { _id: 1 },
        limit: 1,
        singleBatch: true,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]?.count).toBe(1);
    expect(batches[0]!.bytes).toBeLessThan(64);
});
