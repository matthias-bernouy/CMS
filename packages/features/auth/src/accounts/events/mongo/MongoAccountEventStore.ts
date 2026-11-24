import type { FieldCrypto } from "@bernouy/envelope-crypto";
import type { EmailVerificationEvidence } from "../interfaces";
import { prepareEmailProof, readEventProfile } from "./profiles";
import { internalUserId } from "auth/accounts/core/SubjectResolver";
import type { Collection, Db } from "mongodb";
import { accountEventIntent } from "../intent";
import type { AccountEventRecord, AccountEventStore } from "../interfaces";
const fields = { member: "accessAccountCreatedEvent", credential: "accessAccountVerifiedEvent" } as const;
const markerId = "access-events-v1";
type Row = { _id: string; accessAccountCreatedEvent?: unknown; accessAccountVerifiedEvent?: unknown };

/** Metadata-only reads; the journal is embedded atomically in its owning business document. */
export class MongoAccountEventStore implements AccountEventStore {
    constructor(
        private readonly db: Db,
        private readonly prefix = "",
        private readonly crypto?: FieldCrypto,
    ) {}
    private collection(source: AccountEventRecord["source"]): Collection<Row> {
        return this.db.collection(`${this.prefix}${source === "member" ? "users" : "credentials"}`, {
            readConcern: { level: "majority" },
            writeConcern: { w: "majority", j: true },
        });
    }
    async init() {
        const metadata = this.db.collection<{ _id: string; format: string }>(`${this.prefix}access_event_metadata`, {
            writeConcern: { w: "majority", j: true },
        });
        const current = await metadata.findOne({ _id: markerId });
        if (
            current &&
            (current.format !== "ulvia-access-events/v1" || Object.keys(current).sort().join(",") !== "_id,format")
        ) {
            throw new TypeError("Invalid Access Event metadata");
        }
        await this.collection("member").createIndex({ accessAccountReference: 1 }, { unique: true, sparse: true });
        for (const source of ["member", "credential"] as const) {
            await this.collection(source).createIndex({ [`${fields[source]}.dueAt`]: 1, _id: 1 });
        }
        await metadata.updateOne(
            { _id: markerId },
            { $setOnInsert: { format: "ulvia-access-events/v1" } },
            { upsert: true },
        );
    }
    emailEvidence(accountId: string, createdAt: string, method: EmailVerificationEvidence["method"]) {
        return prepareEmailProof(this.db, this.prefix, accountId, createdAt, method);
    }
    profile(accountRef: string) {
        return readEventProfile(this.db, this.prefix, accountRef, this.crypto);
    }
    static async hasWork(db: Db, now = Date.now(), prefix = "") {
        const marker = await db
            .collection<{ _id: string; format: string }>(`${prefix}access_event_metadata`)
            .findOne({ _id: markerId }, { maxTimeMS: 2000 });
        if (!marker) {
            return false;
        }
        if (marker.format !== "ulvia-access-events/v1" || Object.keys(marker).sort().join(",") !== "_id,format") {
            throw new TypeError("Invalid Access Event metadata");
        }
        for (const source of ["member", "credential"] as const) {
            const field = `${fields[source]}.dueAt`;
            if (
                await db
                    .collection(`${prefix}${source === "member" ? "users" : "credentials"}`)
                    .findOne(
                        { [field]: { $type: "string", $lte: new Date(now).toISOString() } },
                        { projection: { _id: 1 }, hint: { [field]: 1, _id: 1 }, maxTimeMS: 2000 },
                    )
            ) {
                return true;
            }
        }
        return false;
    }
    async due(limit: number, now: number) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
            throw new TypeError("Invalid Account Event batch");
        }
        const records: AccountEventRecord[] = [];
        for (const source of ["member", "credential"] as const) {
            const field = fields[source];
            const count = Math.ceil(limit / 2);
            if (!count) {
                continue;
            }
            const rows = await this.collection(source)
                .find(
                    { [`${field}.dueAt`]: { $type: "string", $lte: new Date(now).toISOString() } },
                    { projection: { _id: 1, [field]: 1 }, maxTimeMS: 2000 },
                )
                .hint({ [`${field}.dueAt`]: 1, _id: 1 })
                .sort({ [`${field}.dueAt`]: 1, _id: 1 })
                .limit(count)
                .toArray();
            for (const row of rows) {
                const intent = accountEventIntent(row[field]);
                if (
                    source === "member"
                        ? intent.type !== "account.created" || intent.accountId !== row._id
                        : intent.type !== "account.email-verified" ||
                          intent.accountId !== internalUserId("local", row._id)
                ) {
                    throw new TypeError("Account Event owner mismatch");
                }
                records.push({ source, subjectId: row._id, intent });
            }
        }
        return records.sort((a, b) => a.intent.dueAt!.localeCompare(b.intent.dueAt!)).slice(0, limit);
    }
    async claim(record: AccountEventRecord, token: string, now: number, until: number) {
        const field = fields[record.source];
        if (record.intent.attempts >= Number.MAX_SAFE_INTEGER) {
            throw new TypeError("Invalid Account Event attempts");
        }
        const result = await this.collection(record.source).updateOne(
            {
                _id: record.subjectId,
                [`${field}.occurrenceId`]: record.intent.occurrenceId,
                [`${field}.attempts`]: record.intent.attempts,
                [`${field}.dueAt`]: { $type: "string", $lte: new Date(now).toISOString() },
            },
            {
                $set: {
                    [`${field}.token`]: token,
                    [`${field}.state`]: "sending",
                    [`${field}.dueAt`]: new Date(until).toISOString(),
                },
                $inc: { [`${field}.attempts`]: 1 },
            },
        );
        return result.matchedCount === 1;
    }
    async finish(record: AccountEventRecord, token: string, outcome: Parameters<AccountEventStore["finish"]>[2]) {
        const field = fields[record.source];
        const result = await this.collection(record.source).updateOne(
            { _id: record.subjectId, [`${field}.occurrenceId`]: record.intent.occurrenceId, [`${field}.token`]: token },
            outcome.dueAt === null && !outcome.expired
                ? { $unset: { [field]: "" } }
                : {
                      $set: {
                          [`${field}.token`]: null,
                          [`${field}.state`]: outcome.expired ? "expired" : "pending",
                          [`${field}.dueAt`]: outcome.dueAt === null ? null : new Date(outcome.dueAt).toISOString(),
                          [`${field}.errorCode`]: outcome.errorCode ?? null,
                      },
                  },
        );
        return result.matchedCount === 1;
    }
    async current(record: AccountEventRecord) {
        return Boolean(
            await this.db
                .collection<{ _id: string; createdAt: Date; accessAccountReference: string }>(`${this.prefix}users`)
                .findOne(
                    {
                        _id: record.intent.accountId,
                        createdAt: new Date(record.intent.accountCreatedAt),
                        accessAccountReference: record.intent.accountRef,
                    },
                    { projection: { _id: 1 }, maxTimeMS: 2000 },
                ),
        );
    }
}
