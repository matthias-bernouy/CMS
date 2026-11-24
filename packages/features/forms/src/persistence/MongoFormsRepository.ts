import { z } from "@bernouy/ulvia-sdk";
import type { Collection, Db } from "mongodb";
import { MongoForms, duplicate } from "forms/persistence/MongoForms";
import { submissionRecord } from "forms/persistence/codecs";
import { submissionListInputSchema } from "forms/application/schemas/submissions";
import type { SubmissionListInputDto } from "forms/application/schemas/submissions";
import type { FormsRepository, SubmissionRecord } from "forms/interfaces/repository";
import { FormsError } from "forms/core/errors";

type Stored = { _id: string; record: SubmissionRecord; purgeAt: Date; nonce: string; dueAt: Date | null };
export class MongoFormsRepository extends MongoForms implements FormsRepository {
    private readonly records: Collection<Stored>;
    private constructor(db: Db) {
        super(db);
        this.records = db.collection("form_submissions", {
            writeConcern: { w: "majority", j: true },
            readConcern: { level: "majority" },
        });
    }
    static async open(db: Db) {
        const store = new MongoFormsRepository(db);
        await store.records.createIndex({ "record.deleted": 1, "record.formId": 1, "record.receivedAt": 1, _id: 1 });
        await store.records.createIndex({
            "record.deleted": 1,
            "record.formId": 1,
            "record.status": 1,
            "record.receivedAt": 1,
            _id: 1,
        });
        await store.records.createIndex({ dueAt: 1, _id: 1 });
        await store.records.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 });
        await db.collection("forms_admission").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        return store;
    }
    static async hasWork(db: Db) {
        return Boolean(
            await db
                .collection("form_submissions")
                .findOne(
                    { dueAt: { $ne: null, $lte: new Date() } },
                    { projection: { _id: 1 }, hint: { dueAt: 1, _id: 1 }, maxTimeMS: 2000 },
                ),
        );
    }
    async admit(formId: string) {
        const now = Date.now();
        const start = Math.floor(now / 60000) * 60000;
        const collection = this.db.collection<{ _id: string; count: number; expiresAt: Date }>("forms_admission");
        const record = await collection.findOneAndUpdate(
            { _id: `${formId}:${start}` },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(start + 120000) } },
            { upsert: true, returnDocument: "after", maxTimeMS: 2000 },
        );
        if (!record) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
        if (record.count > 600) {
            throw new FormsError("RATE_LIMITED");
        }
    }
    async replay(receiptId: string) {
        const found = await this.records.findOne({ _id: receiptId });
        if (!found) {
            return undefined;
        }
        if (typeof found.nonce !== "string" || !/^[0-9a-f-]{36}$/i.test(found.nonce)) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
        const record = submissionRecord(found.record);
        if (record.deleted && Date.parse(record.replayExpiresAt) <= Date.now()) {
            return undefined;
        }
        // A changed, journaled nonce confirms a recovered accepted write before acknowledgment.
        const confirmed = await this.records.updateOne(
            {
                _id: receiptId,
                "record.revision": record.revision,
                "record.digest": record.digest,
                "record.principal": record.principal,
                "record.deleted": record.deleted,
            },
            { $set: { nonce: crypto.randomUUID() } },
        );
        if (!confirmed.matchedCount) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
        return record;
    }
    async insert(raw: SubmissionRecord) {
        const record = submissionRecord(raw);
        const row = this.document(record);
        this.size(row, 262144);
        // Reserve future per-recipient lease strings and revision growth before storing answers.
        this.size(
            this.document({
                ...record,
                revision: Number.MAX_SAFE_INTEGER,
                intents: record.intents.map((intent) => ({
                    ...intent,
                    state: "sending",
                    generation: Number.MAX_SAFE_INTEGER,
                    lease: crypto.randomUUID(),
                    deadline: "9999-12-31T23:59:59.999Z",
                })),
            }),
            262144,
        );
        try {
            await this.records.insertOne(row);
            return record;
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
        }
        const existing = await this.replay(record.receiptId);
        if (!existing) {
            throw new FormsError("CORE_UNAVAILABLE");
        }
        return existing;
    }
    async submission(receiptId: string) {
        const row = await this.records.findOne({
            _id: receiptId,
            "record.deleted": false,
            $expr: { $gt: [{ $toDate: "$record.expiresAt" }, "$$NOW"] },
        });
        if (!row) {
            throw new FormsError("SUBMISSION_GONE");
        }
        return submissionRecord(row.record);
    }
    async submissions(input: SubmissionListInputDto) {
        submissionListInputSchema.parse(input);
        for (const value of [input.from, input.to]) {
            if (
                value &&
                (!/^\d{4}-/.test(value) ||
                    !Number.isFinite(Date.parse(value)) ||
                    new Date(value).toISOString() !== value)
            ) {
                throw new FormsError("INVALID_INPUT");
            }
        }
        if (input.from && input.to && input.from >= input.to) {
            throw new FormsError("INVALID_INPUT");
        }
        let after: [string, string] | null = null;
        if (input.after) {
            try {
                after = z.tuple([z.string().length(24), z.string().uuid()]).parse(JSON.parse(input.after));
            } catch {
                throw new FormsError("INVALID_INPUT");
            }
        }
        const range = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lt: input.to } : {}) };
        const rows = await this.records
            .find(
                {
                    "record.formId": input.formId,
                    "record.deleted": false,
                    ...(input.status ? { "record.status": input.status } : {}),
                    ...(Object.keys(range).length ? { "record.receivedAt": range } : {}),
                    ...(after
                        ? {
                              $or: [
                                  { "record.receivedAt": { $gt: after[0] } },
                                  { "record.receivedAt": after[0], _id: { $gt: after[1] } },
                              ],
                          }
                        : {}),
                },
                {
                    projection: {
                        _id: 1,
                        "record.receivedAt": 1,
                        "record.expiresAt": 1,
                        "record.formVersion": 1,
                        "record.status": 1,
                    },
                },
            )
            .hint(
                input.status
                    ? { "record.deleted": 1, "record.formId": 1, "record.status": 1, "record.receivedAt": 1, _id: 1 }
                    : { "record.deleted": 1, "record.formId": 1, "record.receivedAt": 1, _id: 1 },
            )
            .sort({ "record.receivedAt": 1, _id: 1 })
            .limit(input.limit + 1)
            .toArray();
        const page = rows.slice(0, input.limit);
        return {
            submissions: page
                .filter((row) => Date.parse(row.record.expiresAt) > Date.now())
                .map(({ _id, record }) => ({
                    id: _id,
                    formVersion: record.formVersion,
                    receivedAt: record.receivedAt,
                    status: record.status,
                })),
            ...(rows.length > input.limit
                ? { next: JSON.stringify([page.at(-1)!.record.receivedAt, page.at(-1)!._id]) }
                : {}),
        };
    }
    async replace(raw: SubmissionRecord, revision: number) {
        const record = submissionRecord(raw);
        const row = this.document(record);
        this.size(row, 262144);
        const changed = await this.records.replaceOne({ _id: record.receiptId, "record.revision": revision }, row);
        return changed.matchedCount === 1;
    }
    async due(limit: number) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
            throw new TypeError("Invalid work batch");
        }
        const rows = await this.records
            .find({ dueAt: { $ne: null, $lte: new Date() } })
            .sort({ dueAt: 1, _id: 1 })
            .limit(limit)
            .toArray();
        return rows.map((row) => submissionRecord(row.record));
    }
    private document(record: SubmissionRecord): Stored {
        const times = record.intents.flatMap((intent) =>
            intent.state === "pending"
                ? [Date.now()]
                : intent.state === "sending"
                  ? [Date.parse(intent.deadline!)]
                  : [],
        );
        if (record.event?.dueAt) {
            times.push(Date.parse(record.event.dueAt));
        }
        if (!record.deleted) {
            times.push(Date.parse(record.expiresAt));
        }
        return {
            _id: record.receiptId,
            record,
            nonce: crypto.randomUUID(),
            purgeAt: new Date(
                record.deleted
                    ? Date.parse(record.replayExpiresAt)
                    : Math.max(Date.parse(record.expiresAt), Date.parse(record.replayExpiresAt)),
            ),
            dueAt: times.length && !record.deleted ? new Date(Math.min(...times)) : null,
        };
    }
}
