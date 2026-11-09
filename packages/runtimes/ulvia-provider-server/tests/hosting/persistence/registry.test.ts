import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import type { CommandStartedEvent, Db } from "mongodb";
import { MongoProviderInstanceRegistry } from "../../../src/runtime/instances/MongoProviderInstanceRegistry";
import { isPristineHostingDatabase } from "../../../src/runtime/instances/system/hosting/pristine";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";

const url = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = url ? test : test.skip;
let client: MongoClient;
let db: Db;
let registry: MongoProviderInstanceRegistry;
const commands: CommandStartedEvent[] = [];
beforeAll(async () => {
    if (!url) {
        return;
    }
    client = new MongoClient(url, { monitorCommands: true });
    client.on("commandStarted", (event) => commands.push(event));
    await client.connect();
    db = client.db(`ulvia_hosting_registry_${crypto.randomUUID().replaceAll("-", "")}`);
    registry = new MongoProviderInstanceRegistry(db);
    await registry.init();
});
afterAll(async () => {
    if (client) {
        await db.dropDatabase();
        await client.close();
    }
});

integration("freshness probe refuses populated state and closes its metadata cursor", async () => {
    expect(await isPristineHostingDatabase(db)).toBe(true);
    await db.collection("unexpected_existing_state").insertOne({ data: "must not repair" });
    expect(await isPristineHostingDatabase(db)).toBe(false);
    await db.collection("unexpected_existing_state").drop();
    expect(await isPristineHostingDatabase(db)).toBe(true);
});

integration("Mongo instance pages seek by the indexed identity and load only limit plus one", async () => {
    for (const name of ["a", "b", "c", "d"]) {
        await registry.create({
            repository: { url: "https://repo.ulvia.fr", configured: false },

            id: `instance:${name}`,
            storageKey: name,
            idempotencyKey: name,
            idempotencyFingerprint: name,
            creationAuthority: { kind: "operator" },
            label: name,
            cmsUrl: `http://${name}.localhost`,
            gatewayUrl: `http://${name}.localhost`,
            status: "ready",
        });
    }
    commands.length = 0;
    const first = await registry.page({ after: null, limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(["instance:a", "instance:b"]);
    expect(first.nextCursor).toBe("instance:b");
    const second = await registry.page({ after: first.nextCursor, limit: 2 });
    expect(second.items.map((item) => item.id)).toEqual(["instance:c", "instance:d"]);
    expect(second.nextCursor).toBeNull();
    const finds = commands.filter((event) => event.commandName === "find");
    expect(finds).toHaveLength(2);
    expect(finds.every((event) => event.command.limit === 3)).toBe(true);
    expect(finds[1]!.command.filter).toEqual({ id: { $gt: "instance:b" } });
    const plan = await db
        .collection("ulvia_provider_instances")
        .find({ id: { $gt: "instance:b" } })
        .sort({ id: 1 })
        .limit(3)
        .explain("executionStats");
    expect(plan.executionStats.totalDocsExamined).toBe(2);
    expect(plan.executionStats.totalKeysExamined).toBe(2);
    commands.length = 0;
    await expect(registry.page({ after: null, limit: 51 })).rejects.toThrow();
    await expect(registry.page({ after: "arbitrary", limit: 2 })).rejects.toThrow();
    expect(commands).toHaveLength(0);
});

integration("missing persisted creation authority is refused without restoring an operator grant", async () => {
    const collection = db.collection("ulvia_provider_instances");
    await registry.create({
        repository: { url: "https://repo.ulvia.fr", configured: false },

        id: "instance:invalid-authority",
        storageKey: "invalid-authority",
        idempotencyKey: "invalid-authority",
        idempotencyFingerprint: "invalid-authority",
        creationAuthority: { kind: "operator" },
        label: "Invalid authority",
        cmsUrl: "http://invalid.localhost",
        gatewayUrl: "http://invalid.localhost",
        status: "provisioning",
    });
    await collection.updateOne({ id: "instance:invalid-authority" }, { $unset: { creationAuthority: "" } });
    const before = await collection.findOne({ id: "instance:invalid-authority" });
    await expect(registry.get("instance:invalid-authority")).rejects.toThrow("creation authority");
    await expect(registry.getByIdempotencyKey("invalid-authority")).rejects.toThrow("creation authority");
    await expect(registry.update("instance:invalid-authority", 1, { status: "ready" })).rejects.toThrow(
        "creation authority",
    );
    expect(await collection.findOne({ id: "instance:invalid-authority" })).toEqual(before);
    await collection.deleteOne({ id: "instance:invalid-authority" });
});

integration("missing or malformed Repository configuration is refused without state repair", async () => {
    const id = "instance:invalid-repository";
    const valid = { url: "https://repo.ulvia.fr", configured: false };
    await registry.create({
        id,
        storageKey: "invalid-repository",
        idempotencyKey: "invalid-repository",
        idempotencyFingerprint: "one",
        creationAuthority: { kind: "operator" },
        label: "Invalid Repository",
        cmsUrl: "http://invalid.localhost",
        gatewayUrl: "http://invalid.localhost",
        status: "ready",
        repository: valid,
    });
    const collection = db.collection("ulvia_provider_instances");
    for (const invalid of [
        undefined,
        { url: "https://repo.ulvia.fr" },
        { ...valid, configured: "false" },
        { ...valid, url: "file:///tmp/repository" },
    ]) {
        await collection.updateOne(
            { id },
            invalid === undefined ? { $unset: { repository: "" } } : { $set: { repository: invalid } },
        );
        const before = await collection.findOne({ id });
        await expect(registry.get(id)).rejects.toThrow("Repository configuration");
        await expect(registry.getByIdempotencyKey("invalid-repository")).rejects.toThrow("Repository configuration");
        await expect(registry.update(id, 1, { repository: valid })).rejects.toThrow("Repository configuration");
        expect(await collection.findOne({ id })).toEqual(before);
    }
    await collection.deleteOne({ id });
});

integration(
    "resource revisions use four indexed metadata reads with bounded documents and no tenant scan",
    async () => {
        const storage = new MongoSiteUpgradeStorage(db);
        await storage.init();
        await storage.withWrite("default", async () => undefined);
        commands.length = 0;
        const revision = await storage.readResourceRevision("default");
        const reads = commands.filter((event) => event.commandName === "find");
        expect(reads.map((event) => event.command.find)).toEqual([
            "site_resource_revisions",
            "site_upgrade_maintenance",
            "site_write_permits",
            "site_resource_revisions",
        ]);
        expect(reads.every((event) => event.command.limit === 1 && event.command.singleBatch)).toBeTrue();
        for (const event of reads) {
            const explain = await db
                .collection(event.command.find)
                .find(event.command.filter)
                .limit(1)
                .explain("executionStats");
            expect(explain.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
            expect(explain.executionStats.totalKeysExamined).toBeLessThanOrEqual(1);
            const document = await db.collection(event.command.find).findOne(event.command.filter);
            expect(Buffer.byteLength(JSON.stringify(document))).toBeLessThan(256);
        }
        expect(await storage.readResourceRevision("default")).toBe(revision);
        await storage.withWrite("default", async () => undefined);
        expect(await storage.readResourceRevision("default")).not.toBe(revision);
    },
);
