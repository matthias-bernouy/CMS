import { afterAll, beforeAll, expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import { PrimaryDomainManagement } from "@bernouy/hosting";
import { MongoHostingStore } from "@bernouy/hosting/mongo";
import { MongoProviderInstanceRegistry } from "../../../src/runtime/instances/MongoProviderInstanceRegistry";
import type { Db, CommandStartedEvent } from "mongodb";

const url = process.env.ULVIA_HOSTING_MONGO_URL;
const integration = url ? test : test.skip;
let client: MongoClient;
let db: Db;
let domains: MongoHostingStore;
let instances: MongoProviderInstanceRegistry;

beforeAll(async () => {
    if (!url) {
        return;
    }
    client = await MongoClient.connect(url, { monitorCommands: true });
    db = client.db(`ulvia_primary_${crypto.randomUUID().replaceAll("-", "")}`);
    domains = new MongoHostingStore(db);
    instances = new MongoProviderInstanceRegistry(db);
    await Promise.all([domains.init(), instances.init()]);
});
afterAll(async () => {
    if (client) {
        await db.dropDatabase();
        await client.close();
    }
});

async function fixture() {
    const key = crypto.randomUUID();
    const instance = await instances.create({
        id: `instance:${key}`,
        idempotencyKey: key,
        idempotencyFingerprint: key,
        creationAuthority: { kind: "operator" },
        storageKey: key,
        label: "Primary",
        cmsUrl: "http://original.localhost",
        gatewayUrl: "http://callback.localhost",
        repository: { url: "https://repo.example", configured: true },
        status: "ready",
    });
    const domain = await domains.claimDomain({
        hostname: `${key}.localhost`,
        origin: `http://${key}.localhost`,
        instanceId: instance.id,
        claimId: crypto.randomUUID(),
        creationFingerprint: null,
        state: "active",
        tls: "not-required",
        revision: 1,
    });
    const primary = new PrimaryDomainManagement(
        domains,
        {
            getInstance: (id) => instances.get(id),
            setPublicOrigin: (id, revision, origin) => instances.setPublicOrigin(id, revision, origin),
        },
        { assertAdministrator: async () => {} },
    );
    const input = {
        instanceId: instance.id,
        hostname: domain.hostname,
        expectedInstanceRevision: instance.revision,
        expectedDomainRevision: domain.revision,
    };
    return { instance, domain, primary, input, actor: { instanceId: "control", subjectId: "admin" } };
}

integration("Mongo primary election preserves immutable state and hides its reservation from every DTO", async () => {
    const f = await fixture();
    const operations: CommandStartedEvent[] = [];
    const observe = (event: CommandStartedEvent) => {
        if (event.databaseName === db.databaseName) {
            operations.push(event);
        }
    };
    client.on("commandStarted", observe);
    const elected = await f.primary.elect(f.actor, f.input).finally(() => client.off("commandStarted", observe));
    expect(operations).toHaveLength(7);
    expect(operations.every((event) => ["find", "update", "findAndModify"].includes(event.commandName))).toBe(true);
    const current = (await instances.get(f.instance.id))!;
    expect(current).toMatchObject({
        cmsUrl: f.domain.origin,
        revision: f.instance.revision + 1,
        gatewayUrl: f.instance.gatewayUrl,
        repository: f.instance.repository,
        creationAuthority: f.instance.creationAuthority,
        idempotencyKey: f.instance.idempotencyKey,
        idempotencyFingerprint: f.instance.idempotencyFingerprint,
    });
    expect(elected.domain.revision).toBe(2);
    expect(await domains.getPrimaryElection(f.domain.hostname)).toBeNull();
    expect(
        JSON.stringify(await domains.listDomains({ instanceId: f.instance.id, after: null, limit: 1 })),
    ).not.toContain("_primaryElection");
    await expect(
        instances.setPublicOrigin(f.instance.id, f.instance.revision, f.instance.cmsUrl),
    ).rejects.toMatchObject({ code: "CONFLICT" });
});

integration(
    "Mongo domain CAS is fenced during and after election, and interrupted ownership is recoverable",
    async () => {
        const f = await fixture();
        const election = await domains.reservePrimaryElection({ ...f.input, token: crypto.randomUUID() });
        expect(await domains.getDomain(f.domain.hostname)).toEqual(f.domain);
        await expect(domains.replaceDomain(1, { ...f.domain, state: "disabled", revision: 2 })).rejects.toMatchObject({
            code: "CONFLICT",
        });
        const elected = await f.primary.elect(f.actor, f.input);
        expect(elected.origin).toBe(f.domain.origin);
        await expect(domains.finishPrimaryElection(election, true)).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(domains.replaceDomain(1, { ...f.domain, state: "disabled", revision: 2 })).rejects.toMatchObject({
            code: "CONFLICT",
        });
        expect((await instances.get(f.instance.id))!.revision).toBe(f.instance.revision + 2);
    },
);

integration("an acknowledged Mongo instance write survives interruption before reservation cleanup", async () => {
    const f = await fixture();
    await domains.reservePrimaryElection({ ...f.input, token: crypto.randomUUID() });
    await instances.setPublicOrigin(f.instance.id, f.instance.revision, f.domain.origin);
    const reopened = new MongoHostingStore(db);
    const primary = new PrimaryDomainManagement(
        reopened,
        {
            getInstance: (id) => instances.get(id),
            setPublicOrigin: (id, revision, origin) => instances.setPublicOrigin(id, revision, origin),
        },
        { assertAdministrator: async () => {} },
    );
    const elected = await primary.elect(f.actor, f.input);
    expect(elected.revision).toBe(f.instance.revision + 1);
    expect(await reopened.getPrimaryElection(f.domain.hostname)).toBeNull();
});
