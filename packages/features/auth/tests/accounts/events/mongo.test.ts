import { beforeAll, afterAll, describe, test, expect } from "bun:test";
import type { CommandStartedEvent } from "mongodb";
import { contentMongo } from "../../../../../../tests/integration/content/mongo";
import { AccountEventWorker } from "@bernouy/auth";
import { MongoAccountEventStore } from "@bernouy/auth/mongo";
import { accountMongoFixture } from "./mongo-fixture";

const enabled = process.env.ULVIA_RUN_ACCESS_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Access business Event standalone Mongo", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    const setup = () => accountMongoFixture(mongo.client.db(`accounts_${crypto.randomUUID().replaceAll("-", "")}`));
    test("cold probes leave unused state untouched; atomic creation and concurrent proof capture retain one fact each", async () => {
        const unused = mongo.client.db(`unused_${crypto.randomUUID().replaceAll("-", "")}`);
        expect(await MongoAccountEventStore.hasWork(unused)).toBe(false);
        expect(await unused.listCollections().toArray()).toEqual([]);
        const f = await setup();
        const credential = await f.credentials.create({
            email: "member@performance.test",
            password: "secure-test-password",
            emailVerified: false,
        });
        const member = await f.users.upsert({
            sub: `local:${credential.sub}`,
            provider: "local",
            email: credential.email,
        });
        await Promise.all(Array.from({ length: 8 }, () => f.users.upsert({ ...member, provider: "local" })));
        const proof = await f.events.emailEvidence(member.sub, member.createdAt.toISOString(), "email-link");
        await Promise.all(Array.from({ length: 8 }, () => f.credentials.markEmailVerified(credential.sub, proof)));
        const rows = await f.events.due(25, Date.now());
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map(({ intent }) => intent.occurrenceId)).size).toBe(2);
        expect(await MongoAccountEventStore.hasWork(f.db)).toBe(true);
        const raw = await f.db.collection("credentials").findOne({});
        expect(raw!.emailVerifiedAt).not.toBeNull();
        expect(raw!.accessAccountVerifiedEvent).toBeDefined();
        expect(JSON.stringify(raw)).not.toContain("member@performance.test");
        expect(JSON.stringify(rows)).not.toContain("member@performance.test");
        const reopened = new MongoAccountEventStore(f.db);
        expect(await reopened.due(25, Date.now())).toEqual(rows);
    });
    test("a refused credential write commits neither the proof nor its intent", async () => {
        const f = await setup();
        const credential = await f.credentials.create({
            email: "failed@performance.test",
            password: "secure-test-password",
            emailVerified: false,
        });
        const member = await f.users.upsert({ sub: `local:${credential.sub}`, provider: "local" });
        const evidence = await f.events.emailEvidence(member.sub, member.createdAt.toISOString(), "email-link");
        await mongo.client.db("admin").command({
            configureFailPoint: "failCommand",
            mode: { times: 1 },
            data: { failCommands: ["update"], errorCode: 2 },
        });
        try {
            await expect(f.credentials.markEmailVerified(credential.sub, evidence)).rejects.toThrow();
        } finally {
            await mongo.client.db("admin").command({ configureFailPoint: "failCommand", mode: "off" });
        }
        const raw = await f.db.collection("credentials").findOne({});
        expect(raw!.emailVerifiedAt).toBeNull();
        expect(raw!.accountEmailProof).toBeUndefined();
        expect(raw!.accessAccountVerifiedEvent).toBeUndefined();
        expect((await f.events.due(25, Date.now())).map(({ intent }) => intent.type)).toEqual(["account.created"]);
    });
    test("lost replies and expired leases resume with stable IDs, while rows and prefixes remain isolated", async () => {
        const f = await setup();
        await f.users.upsert({ sub: "external:recovery", provider: "external" });
        let now = Date.now();
        let attempts = 0;
        const accepted = new Map<string, string>();
        const deliver = {
            publish: async (intent: { occurrenceId: string; payloadJson: string }) => {
                attempts++;
                const prior = accepted.get(intent.occurrenceId);
                if (prior) {
                    expect(prior).toBe(intent.payloadJson);
                }
                accepted.set(intent.occurrenceId, intent.payloadJson);
                if (attempts === 1) {
                    throw new Error("reply lost after acceptance");
                }
            },
        };
        expect(await new AccountEventWorker(f.events, deliver, undefined, () => now).tick()).toBe(1);
        now += 5001;
        const reopened = new MongoAccountEventStore(f.db);
        expect(await new AccountEventWorker(reopened, deliver, undefined, () => now).tick()).toBe(1);
        expect(accepted.size).toBe(1);
        expect(await reopened.due(25, now)).toEqual([]);
        const foreign = await accountMongoFixture(f.db, "foreign_");
        expect(await foreign.events.due(25, now)).toEqual([]);
        const another = await setup();
        expect(await another.events.due(25, now)).toEqual([]);
        await f.users.upsert({ sub: "external:delete", provider: "external" });
        const record = (await reopened.due(1, now))[0]!;
        const lease = crypto.randomUUID();
        expect(await reopened.claim(record, lease, now, now + 30000)).toBe(true);
        const stale = (await reopened.due(1, now + 30001))[0]!;
        const newer = crypto.randomUUID();
        expect(await reopened.claim(stale, newer, now + 30001, now + 60000)).toBe(true);
        expect(await reopened.finish(record, lease, { dueAt: null })).toBe(false);
        await f.users.delete("external:delete");
        expect(await reopened.current(stale)).toBe(false);
        expect(await reopened.finish(stale, newer, { dueAt: null })).toBe(false);
    });
    test("reference resolution is minimal, indexed and isolated, including legacy proof registration and recreation", async () => {
        const f = await setup();
        const sub = "external:private@performance.test";
        const member = await f.users.upsert({ sub, provider: "external", email: "private@performance.test" });
        const first = (await f.events.due(25, Date.now()))[0]!;
        expect(first.intent.payloadJson).not.toContain("private");
        expect(await f.events.profile(first.intent.accountRef)).toEqual({
            createdAt: member.createdAt.toISOString(),
            email: member.email,
        });
        const foreign = await accountMongoFixture(f.db, "foreign_");
        expect(await foreign.events.profile(first.intent.accountRef)).toBeNull();
        expect(await (await setup()).events.profile(first.intent.accountRef)).toBeNull();
        await f.users.delete(sub);
        await f.users.upsert({ sub, provider: "external", email: "replacement@performance.test" });
        expect(await f.events.profile(first.intent.accountRef)).toBeNull();
        expect(await f.events.current(first)).toBe(false);
        const next = (await f.events.due(25, Date.now()))[0]!;
        expect(next.intent.accountRef).not.toBe(first.intent.accountRef);
        const legacy = "local:legacy";
        await f.db
            .collection<{ _id: string; createdAt: Date }>("users")
            .insertOne({ _id: legacy, createdAt: member.createdAt });
        const proofs = await Promise.all(
            Array.from({ length: 8 }, () =>
                f.events.emailEvidence(legacy, member.createdAt.toISOString(), "password-reset"),
            ),
        );
        expect(new Set(proofs.map((proof) => proof.accountRef)).size).toBe(1);
        expect((await f.events.due(25, Date.now())).some((row) => row.intent.accountId === legacy)).toBe(false);
        const calls: CommandStartedEvent[] = [];
        const monitor = (call: CommandStartedEvent) => {
            if (call.databaseName === f.db.databaseName && call.commandName === "find") {
                calls.push(call);
            }
        };
        mongo.client.on("commandStarted", monitor);
        try {
            await f.events.profile(next.intent.accountRef);
            expect(calls).toHaveLength(1);
            expect(calls[0]!.command.hint).toEqual({ accessAccountReference: 1 });
            expect(calls[0]!.command.projection).toEqual({ _id: 0, emailEnc: 1, createdAt: 1 });
        } finally {
            mongo.client.off("commandStarted", monitor);
        }
    });
    test("work reads use two projected indexed pages and exclude credential hashes and encrypted email", async () => {
        const f = await setup();
        for (let index = 0; index < 30; index++) {
            await f.users.upsert({
                sub: `external:${index}`,
                provider: "external",
                email: `member-${index}@performance.test`,
            });
        }
        const calls: CommandStartedEvent[] = [];
        const monitor = (call: CommandStartedEvent) => {
            if (call.databaseName === f.db.databaseName && call.commandName === "find") {
                calls.push(call);
            }
        };
        mongo.client.on("commandStarted", monitor);
        try {
            const rows = await f.events.due(25, Date.now());
            expect(rows).toHaveLength(13);
            expect(calls).toHaveLength(2);
            for (const call of calls) {
                expect(call.command.limit).toBe(13);
                expect(call.command.hint._id).toBe(1);
                expect(call.command.projection.hash).toBeUndefined();
                expect(call.command.projection.emailEnc).toBeUndefined();
                expect(Object.keys(call.command.projection)).toHaveLength(2);
            }
            expect(JSON.stringify(rows)).not.toContain("@performance.test");
        } finally {
            mongo.client.off("commandStarted", monitor);
        }
    });
});
