import { beforeAll, afterAll, describe, test, expect } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import { migrateFormsV1 } from "@bernouy/forms/migration/mongo";
import { MongoFormsRepository } from "@bernouy/forms/mongo";
import { legacyFixture } from "./fixtures";
const enabled = process.env.ULVIA_RUN_FORMS_MIGRATION_MONGO === "1";
describe.skipIf(!enabled)("Forms explicit migration on standalone Mongo", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    async function setup(version: "1.0.0" | "1.1.0") {
        const db = mongo.client.db(`migration_${crypto.randomUUID().replaceAll("-", "")}`),
            f = legacyFixture(version);
        await db.collection<{ _id: string }>("forms").insertOne(f.form);
        await db.collection<{ _id: string }>("form_versions").insertOne(f.publication);
        await db.collection<{ _id: string }>("form_submissions").insertOne(f.submission);
        return { db, f };
    }
    test("plan is read-only, conversion is readable by Forms 2 and no old submission event is synthesized", async () => {
        for (const version of ["1.0.0", "1.1.0"] as const) {
            const { db, f } = await setup(version),
                original = await db.collection("forms").findOne({});
            const plan = await migrateFormsV1(db, version);
            expect(plan).toMatchObject({ forms: 1, versions: 1, submissions: 1 });
            expect(await db.collection("forms").findOne({})).toEqual(original);
            const settings: unknown[] = [];
            expect(
                await migrateFormsV1(db, version, true, async (value) => {
                    settings.push(value);
                }),
            ).toEqual(plan);
            expect(settings).toHaveLength(2);
            const reader = await MongoFormsRepository.open(db);
            expect((await reader.get(f.formId)).draft).not.toHaveProperty("notification");
            expect((await reader.version(f.formId, 1)).draft).not.toHaveProperty("notification");
            const submission = await reader.submission(f.receiptId);
            expect(submission.answers).toEqual(f.submission.record.answers);
            expect(submission.event === null).toBe(version === "1.0.0");
            await expect(migrateFormsV1(db, version, true, async () => {})).rejects.toThrow();
        }
    });
    test("an unresolved send prevents all writes, including earlier form documents", async () => {
        const { db, f } = await setup("1.1.0");
        await db.collection("form_submissions").updateOne({}, { $set: { "record.intents.0.state": "unknown" } });
        const before = await db.collection("forms").findOne({});
        const exported: unknown[] = [];
        await expect(
            migrateFormsV1(db, "1.1.0", true, async (value) => {
                exported.push(value);
            }),
        ).rejects.toThrow("FORMS_EMAIL_UNRESOLVED");
        expect(await db.collection("forms").findOne({})).toEqual(before);
        expect(exported).toEqual([]);
        expect(f.form.record.draft.notification).toBeDefined();
    });
});
