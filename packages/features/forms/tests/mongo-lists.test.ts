import { expect, test } from "bun:test";
import type { CommandStartedEvent } from "mongodb";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { MongoFormsRepository } from "../src/exports/mongo";
import { FormsService, SubmissionService } from "../src/exports/index";
import { draft } from "./fixtures";

const integration = process.env.ULVIA_RUN_FORMS_MONGO === "1" ? test : test.skip;
integration(
    "Mongo lists use one projected limit+1 read and preserve cursor progress over expired rows",
    async () => {
        const fixture = await contentMongo();
        try {
            const db = fixture.client.db("forms_lists");
            const store = await MongoFormsRepository.open(db);
            const forms = new FormsService(store, async () => true);
            const service = new SubmissionService(store, forms);
            const minimal = { ...draft, fields: [], notification: { ...draft.notification, enabled: false } };
            const formIds: string[] = [];
            for (let index = 0; index < 101; index++) {
                const formId = crypto.randomUUID();
                await forms.create({ formId, draft: minimal }, "admin");
                formIds.push(formId);
            }
            const formId = formIds[0]!;
            await forms.publish({ formId, expectedRevision: 1 });
            await forms.availability({ formId, expectedRevision: 2, availability: "open" });
            for (let index = 0; index < 101; index++) {
                await service.submit(
                    { formId, formVersion: 1, attemptId: crypto.randomUUID(), answers: [] },
                    "visitor",
                    "public",
                );
            }
            const calls: CommandStartedEvent[] = [];
            const monitor = (event: CommandStartedEvent) => {
                if (event.databaseName === db.databaseName) {
                    calls.push(event);
                }
            };
            fixture.client.on("commandStarted", monitor);
            let after: string | undefined;
            const listed: string[] = [];
            do {
                calls.length = 0;
                const page = await forms.list({ limit: 25, ...(after ? { after } : {}) });
                expect(calls.map((call) => call.commandName)).toEqual(["find"]);
                expect(calls[0]!.command.limit).toBe(26);
                expect(calls[0]!.command.projection["record.draft.title"]).toBe(1);
                expect(calls[0]!.command.projection["record.draft.fields"]).toBeUndefined();
                listed.push(...page.forms.map((form) => form.id));
                after = page.next;
            } while (after);
            expect(listed).toEqual([...formIds].sort());
            const rows = await db
                .collection("form_submissions")
                .find({})
                .sort({ "record.receivedAt": 1, _id: 1 })
                .toArray();
            await db
                .collection("form_submissions")
                .updateMany(
                    { _id: { $in: rows.slice(0, 25).map((row) => row._id) } },
                    { $set: { "record.expiresAt": "2000-01-01T00:00:00.000Z" } },
                );
            after = undefined;
            const receipts: string[] = [];
            let first = true;
            do {
                calls.length = 0;
                const page = await service.list({ formId, limit: 25, status: "new", ...(after ? { after } : {}) });
                expect(calls.map((call) => call.commandName)).toEqual(["find"]);
                expect(calls[0]!.command.limit).toBe(26);
                expect(calls[0]!.command.projection["record.answers"]).toBeUndefined();
                expect(calls[0]!.command.hint["record.status"]).toBe(1);
                if (first) {
                    expect(page.submissions).toEqual([]);
                    expect(page.next).toBeDefined();
                    first = false;
                }
                receipts.push(...page.submissions.map((row) => row.id));
                after = page.next;
            } while (after);
            expect(receipts).toEqual(rows.slice(25).map((row) => String(row._id)));
            fixture.client.off("commandStarted", monitor);
        } finally {
            await fixture.close();
        }
    },
    30000,
);
