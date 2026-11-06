import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
import { MongoSessionRepository } from "@bernouy/cms-auth/mongo";
import { SessionTokenService, MAX_ACCOUNT_SESSIONS } from "@bernouy/cms-auth";

const mongo = process.env.ULVIA_AUTH_TEST_MONGO_URL;
const DAY = 86400_000;

test.skipIf(!mongo)(
    "Mongo sessions persist, stay bounded, enforce expiry and atomically fence revocation",
    async () => {
        const client = new MongoClient(mongo!, { monitorCommands: true });
        const commands: string[] = [];
        const loaded: number[] = [];
        client.on("commandStarted", (event) => {
            commands.push(event.commandName);
        });
        client.on("commandSucceeded", (event) => {
            if (event.commandName === "findAndModify" && event.reply.value?.sessions) {
                loaded.push(event.reply.value.sessions.length);
            }
        });
        const db = client.db(`ulvia-session-test-${randomUUID()}`);
        let now = Date.now();
        try {
            await client.connect();
            const repository = new MongoSessionRepository(db);
            await repository.init();
            const sessions = new SessionTokenService({ repository, now: () => now });
            const logins = await Promise.all(
                Array.from({ length: MAX_ACCOUNT_SESSIONS + 8 }, () => sessions.issue("account")),
            );
            const stored = await db.collection("sessions").findOne({ _id: "account" });
            expect(stored!.sessions).toHaveLength(MAX_ACCOUNT_SESSIONS);
            for (const login of logins) {
                expect(JSON.stringify(stored)).not.toContain(login!.token);
            }
            const active = [];
            for (const login of logins) {
                if (await sessions.readToken(login!.token)) {
                    active.push(login!);
                }
            }
            expect(active).toHaveLength(MAX_ACCOUNT_SESSIONS);
            const login = active[0]!;
            const restarted = new SessionTokenService({ repository: new MongoSessionRepository(db), now: () => now });
            commands.length = 0;
            loaded.length = 0;
            expect(await restarted.readToken(login.token)).toEqual({ sub: "account" });
            expect(commands).toEqual(["findAndModify"]);
            expect(loaded).toEqual([1]);
            const otherRepository = new MongoSessionRepository(db, { collectionPrefix: "other_" });
            await otherRepository.init();
            const otherInstance = new SessionTokenService({ repository: otherRepository, now: () => now });
            expect(await otherInstance.readToken(login.token)).toBeNull();
            await otherInstance.revoke(login.token);
            expect(await sessions.readToken(login.token)).not.toBeNull();
            const other = (await sessions.issue("other-account"))!;
            now += 6 * DAY;
            expect(await sessions.readToken(login.token)).not.toBeNull();
            now += 7 * DAY;
            expect(await sessions.readToken(login.token)).toBeNull();
            const expired = await db.collection("sessions").findOne({ _id: "account" });
            expect(
                expired!.sessions.find(
                    (item: { tokenHash: string }) => item.tokenHash === stored!.sessions[0].tokenHash,
                )?.lastActivityAt,
            ).toBeDefined();
            expect(await sessions.readToken(other.token)).toBeNull();

            const fresh = (await sessions.issue("account"))!;
            for (let day = 1; day < 30; day++) {
                now += DAY;
                expect(await sessions.readToken(fresh.token)).not.toBeNull();
            }
            now += DAY;
            expect(await sessions.readToken(fresh.token)).toBeNull();
            const revocable = (await sessions.issue("account"))!;
            const isolated = (await sessions.issue("other-account"))!;
            const proofStartedAt = now;
            now += 1;
            await Promise.all([sessions.readToken(revocable.token), sessions.revokeForSub("account")]);
            expect(await sessions.readToken(revocable.token)).toBeNull();
            expect(await sessions.issue("account", proofStartedAt)).toBeNull();
            expect(await sessions.readToken(isolated.token)).not.toBeNull();
            now += 1;
            const afterRevocation = (await sessions.issue("account"))!;
            await Promise.all([sessions.readToken(afterRevocation.token), sessions.revoke(afterRevocation.token)]);
            expect(await sessions.readToken(afterRevocation.token)).toBeNull();
            const beforeInvalid = await db.collection("sessions").findOne({ _id: "account" });
            await db.collection("sessions").updateOne({ _id: "account" }, { $unset: { invalidatedBefore: "" } });
            expect(await sessions.readToken(afterRevocation.token)).toBeNull();
            await expect(sessions.issue("account")).rejects.toThrow("Stored session account is invalid");
            expect(await db.collection("sessions").findOne({ _id: "account" })).toEqual(
                Object.fromEntries(Object.entries(beforeInvalid!).filter(([key]) => key !== "invalidatedBefore")),
            );
            const indexes = await db.collection("sessions").indexes();
            expect(indexes.some((index) => index.expireAfterSeconds === 0)).toBeTrue();
        } finally {
            await db.dropDatabase();
            await client.close();
        }
    },
    30_000,
);
