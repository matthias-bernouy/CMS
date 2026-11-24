import { expect, test } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import { MongoFormsRepository } from "../../src/exports/mongo";
import { FormsService, SubmissionService, SubmissionEventWorker } from "../../src/exports/index";
import type { FormsSubmissionEvents } from "../../src/exports/index";
import { draft, answers } from "../fixtures";
import { submissionRecord } from "../../src/persistence/codecs";
const integration = process.env.ULVIA_RUN_FORMS_MONGO === "1" ? test : test.skip;
integration(
    "the accepted intent retains its original proof across restart, retry and idempotent submission",
    async () => {
        const fixture = await contentMongo();
        try {
            const db = fixture.client.db(`origin_${crypto.randomUUID().replaceAll("-", "")}`);
            const store = await MongoFormsRepository.open(db);
            const forms = new FormsService(store, async () => true);
            const formId = crypto.randomUUID();
            await forms.create(
                { formId, draft: { ...draft, notification: { ...draft.notification, enabled: false } } },
                "admin",
            );
            await forms.publish({ formId, expectedRevision: 1 });
            await forms.availability({ formId, expectedRevision: 2, availability: "open" });
            let captures = 0;
            const received: string[] = [];
            const events: FormsSubmissionEvents = {
                prepare: async (causation, proof) => ({
                    installationId: "native",
                    definitionId: "a".repeat(64),
                    causation,
                    initiatorProof: proof ?? null,
                    state: "pending",
                    attempts: 0,
                    token: null,
                    dueAt: new Date().toISOString(),
                }),
                publish: async (record) => {
                    received.push(record.event!.initiatorProof!);
                },
            };
            const service = new SubmissionService(store, forms, Date.now, events);
            const input = { formId, formVersion: 1, attemptId: crypto.randomUUID(), answers };
            const capture = async () => {
                captures++;
                return "ei1.original-verified-reference";
            };
            await service.submit(input, "verified-user", "public", [], capture);
            await service.submit(input, "verified-user", "public", [], capture);
            expect(captures).toBe(1);
            const reopened = await MongoFormsRepository.open(db);
            const accepted = await reopened.submission(input.attemptId);
            expect(accepted.event!.initiatorProof).toBe("ei1.original-verified-reference");
            const { initiatorProof: _proof, ...missing } = accepted.event!;
            expect(() => submissionRecord({ ...accepted, event: missing })).toThrow();
            await new SubmissionEventWorker(reopened, events).tick();
            expect(received).toEqual(["ei1.original-verified-reference"]);
            expect((await reopened.submission(input.attemptId)).event!.state).toBe("accepted");
            await expect(
                service.submit({ ...input, attemptId: crypto.randomUUID() }, "other", "public", [], async () => {
                    throw new Error("capture unavailable");
                }),
            ).rejects.toThrow("capture unavailable");
            expect(await db.collection("form_submissions").countDocuments()).toBe(1);
        } finally {
            await fixture.close();
        }
    },
    30000,
);
