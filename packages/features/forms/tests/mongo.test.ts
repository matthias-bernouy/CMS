import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { MongoFormsRepository } from "../src/exports/mongo";
import { FormsService, SubmissionService, SubmissionEventWorker } from "../src/exports/index";
import { draft, answers } from "./fixtures";

const enabled = process.env.ULVIA_RUN_FORMS_MONGO === "1";
describe.skipIf(!enabled)("Forms standalone Mongo lifecycle", () => {
    let fixture: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        fixture = await contentMongo();
    }, 30_000);
    afterAll(async () => {
        await fixture?.close();
    }, 30_000);
    test("cold discovery leaves an unused database unchanged", async () => {
        const db = fixture.client.db(`unused_${crypto.randomUUID().replaceAll("-", "")}`);
        expect(await MongoFormsRepository.hasWork(db)).toBe(false);
        expect(await db.listCollections().toArray()).toEqual([]);
    });
    const setup = async () => {
        const db = fixture.client.db(`forms_${crypto.randomUUID().replaceAll("-", "")}`);
        const store = await MongoFormsRepository.open(db);
        const forms = new FormsService(store);
        const submissions = new SubmissionService(store, forms);
        const formId = crypto.randomUUID();
        await forms.create({ formId, draft }, "admin");
        const published = await forms.publish({ formId, expectedRevision: 1 });
        await forms.availability({ formId, expectedRevision: 2, availability: "open" });
        const input = {
            formId,
            formVersion: published.version,
            attemptId: crypto.randomUUID(),
            answers: answers.map((answer) => ({ ...answer })),
        };
        return { db, store, forms, submissions, input };
    };
    test("all types persist, exact retries converge and publications remain immutable after reopening", async () => {
        const f = await setup();
        const results = await Promise.all(
            Array.from({ length: 12 }, () => f.submissions.submit(f.input, "visitor", "public")),
        );
        expect(new Set(results.map((item) => item.receiptId)).size).toBe(1);
        expect(await f.db.collection("form_submissions").countDocuments()).toBe(1);
        const ack = results[0]!;
        expect((await f.submissions.get(ack.receiptId)).answers).toEqual(answers);
        await f.forms.update({ formId: f.input.formId, expectedRevision: 3, draft: { ...draft, title: "Changed" } });
        await f.forms.publish({ formId: f.input.formId, expectedRevision: 4 });
        expect((await f.forms.version(f.input.formId, 1)).draft.title).toBe("Contact");
        const reopened = await MongoFormsRepository.open(f.db);
        expect((await reopened.submission(ack.receiptId)).answers).toEqual(answers);
        expect(await f.submissions.submit(f.input, "visitor", "public")).toEqual(ack);
        await expect(f.submissions.submit({ ...f.input, answers: [] }, "visitor", "public")).rejects.toThrow(
            "IDEMPOTENCY_CONFLICT",
        );
        const foreign = await setup();
        await expect(foreign.submissions.get(ack.receiptId)).rejects.toThrow("SUBMISSION_GONE");
    });
    test("invalid answers, stale versions, wrong access and closed windows do not store business records", async () => {
        const f = await setup();
        for (const call of [
            () => f.submissions.submit({ ...f.input, answers: [] }, "visitor", "public"),
            () => f.submissions.submit({ ...f.input, formVersion: 9 }, "visitor", "public"),
            () => f.submissions.submit(f.input, "visitor", "authenticated"),
        ]) {
            await expect(call()).rejects.toThrow();
        }
        await f.forms.availability({ formId: f.input.formId, expectedRevision: 3, availability: "closed" });
        await expect(f.submissions.submit(f.input, "visitor", "public")).rejects.toThrow("FORM_CLOSED");
        expect(await f.db.collection("form_submissions").countDocuments()).toBe(0);
    });
    test("answers persist without Emailer; private state updates and deletion erase payload", async () => {
        const f = await setup();
        const ack = await f.submissions.submit(f.input, "visitor", "public");
        expect(await f.store.submission(ack.receiptId)).not.toHaveProperty("notification");
        expect(await f.submissions.get(ack.receiptId)).not.toHaveProperty("notifications");
        await f.submissions.status({ receiptId: ack.receiptId, expectedRevision: 1, status: "processed" });
        expect((await f.submissions.get(ack.receiptId)).status).toBe("processed");
        const deleted = await f.submissions.delete(ack.receiptId);
        expect(deleted).toEqual({ receiptId: ack.receiptId, deleted: true });
        expect(await f.submissions.delete(ack.receiptId)).toEqual(deleted);
        const raw = await f.db.collection("form_submissions").findOne({});
        expect(JSON.stringify(raw)).not.toContain("a@example.com");
        expect(JSON.stringify(raw)).not.toContain("admin@example.test");
        await expect(f.submissions.get(ack.receiptId)).rejects.toThrow("SUBMISSION_GONE");
        await expect(f.submissions.submit(f.input, "visitor", "public")).rejects.toThrow("SUBMISSION_GONE");
    });
    test("background retention erases expired payload while preserving replay protection", async () => {
        const f = await setup();
        await f.submissions.submit(f.input, "visitor", "public");
        const retained = await f.store.submission(f.input.attemptId);
        await f.store.replace(
            { ...retained, revision: retained.revision + 1, expiresAt: new Date(Date.now() - 1000).toISOString() },
            retained.revision,
        );
        const worker = new SubmissionEventWorker(f.store);
        expect(await worker.tick()).toBe(1);
        const record = await f.store.replay(f.input.attemptId);
        expect(record!.deleted).toBe(true);
        expect(record!.answers).toEqual([]);
        expect(record!.event).toBeNull();
        expect(await worker.tick()).toBe(0);
        await worker.stop();
        await expect(f.submissions.submit(f.input, "visitor", "public")).rejects.toThrow("SUBMISSION_GONE");
    });
});
