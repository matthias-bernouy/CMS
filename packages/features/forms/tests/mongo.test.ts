import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { MongoFormsRepository } from "../src/exports/mongo";
import { FormsService, SubmissionService, NotificationWorker } from "../src/exports/index";
import { draft, answers } from "./fixtures";
import type { FormsDelivery } from "../src/exports/index";

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
    const setup = async (notify = true) => {
        const db = fixture.client.db(`forms_${crypto.randomUUID().replaceAll("-", "")}`);
        const store = await MongoFormsRepository.open(db);
        const forms = new FormsService(store, async () => true);
        const submissions = new SubmissionService(store, forms);
        const formId = crypto.randomUUID();
        await forms.create(
            { formId, draft: { ...draft, notification: { ...draft.notification, enabled: notify } } },
            "admin",
        );
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
    test("disabled notifications keep answers, private state updates and deletion erase payload", async () => {
        const f = await setup(false);
        const ack = await f.submissions.submit(f.input, "visitor", "public");
        expect((await f.store.submission(ack.receiptId)).notification).toBeNull();
        expect((await f.submissions.get(ack.receiptId)).notifications).toEqual([]);
        await f.submissions.status({ receiptId: ack.receiptId, expectedRevision: 1, status: "processed" });
        expect((await f.submissions.get(ack.receiptId)).status).toBe("processed");
        const deleted = await f.submissions.delete(ack.receiptId);
        expect(deleted).toEqual({ receiptId: ack.receiptId, deleted: true, deliveryMayComplete: false });
        expect(await f.submissions.delete(ack.receiptId)).toEqual(deleted);
        const raw = await f.db.collection("form_submissions").findOne({});
        expect(JSON.stringify(raw)).not.toContain("a@example.com");
        expect(JSON.stringify(raw)).not.toContain("admin@example.test");
        await expect(f.submissions.get(ack.receiptId)).rejects.toThrow("SUBMISSION_GONE");
        await expect(f.submissions.submit(f.input, "visitor", "public")).rejects.toThrow("SUBMISSION_GONE");
    });
    test("delivery uncertainty is retained and manual retry requires duplicate-risk acceptance", async () => {
        const f = await setup();
        const ack = await f.submissions.submit(f.input, "visitor", "public");
        let calls = 0;
        const delivery: FormsDelivery = {
            available: async () => true,
            send: async () => {
                calls++;
                return "unknown";
            },
        };
        const worker = new NotificationWorker("fixture", f.store, delivery);
        await worker.tick();
        expect(calls).toBe(1);
        let current = await f.submissions.get(ack.receiptId);
        expect(current.notifications[0]!.state).toBe("unknown");
        await worker.tick();
        expect(calls).toBe(1);
        const retry = {
            receiptId: ack.receiptId,
            expectedRevision: current.revision,
            index: 0,
            intentGeneration: 1,
            acceptDuplicateRisk: false,
        };
        await expect(f.submissions.retry(retry)).rejects.toThrow("REVISION_CONFLICT");
        await f.submissions.retry({ ...retry, acceptDuplicateRisk: true });
        await f.submissions.retry({ ...retry, acceptDuplicateRisk: true });
        current = await f.submissions.get(ack.receiptId);
        expect(current.notifications[0]!.generation).toBe(2);
        await worker.stop();
    });
});
