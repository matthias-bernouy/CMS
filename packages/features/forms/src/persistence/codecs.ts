import { z } from "@bernouy/ulvia-sdk";
import { answerSchema } from "forms/application/schemas/public";
import { uuidSchema, revisionSchema } from "forms/application/schemas/authoring";
import { submissionStatusSchema } from "forms/application/schemas/submissions";
import { lossless } from "forms/core/inputBounds";
import { FormsError } from "forms/core/errors";
import type { SubmissionRecord } from "forms/interfaces/repository";

const date = z
    .string()
    .length(24)
    .refine(
        (value) =>
            /^\d{4}-/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    );
const submissionRecordSchema = z.strictObject({
    event: z
        .strictObject({
            initiatorProof: z.string().min(1).max(2048).nullable(),
            installationId: z.string().min(1).max(128),
            definitionId: z.string().regex(/^[a-f0-9]{64}$/u),
            causation: z
                .array(z.string().regex(/^[a-f0-9]{64}$/u))
                .max(32)
                .readonly(),
            state: z.enum(["pending", "sending", "accepted", "failed"]),
            attempts: z.int().min(0).max(9007199254740991),
            token: uuidSchema.nullable(),
            dueAt: date.nullable(),
        })
        .nullable(),
    receiptId: uuidSchema,
    formId: uuidSchema,
    formVersion: revisionSchema,
    principal: z.string().length(64),
    digest: z.string().length(64),
    receivedAt: date,
    expiresAt: date,
    replayExpiresAt: date,
    status: submissionStatusSchema,
    revision: revisionSchema,
    answers: z.array(answerSchema).max(8192),
    notification: z.strictObject({ subject: z.string().max(998), text: z.string().max(131072) }).nullable(),
    intents: z
        .array(
            z.strictObject({
                email: z.string().max(320),
                state: z.enum(["pending", "sending", "accepted", "blocked", "failed", "unknown"]),
                generation: revisionSchema,
                lease: uuidSchema.nullable(),
                deadline: date.nullable(),
            }),
        )
        .max(8192),
    deleted: z.boolean(),
    deliveryMayComplete: z.boolean(),
    lastAdmin: z.strictObject({ revision: revisionSchema, digest: z.string().length(64) }).nullable(),
});
export function submissionRecord(value: unknown): SubmissionRecord {
    const record = submissionRecordSchema.parse(value);
    if (
        !lossless(record) ||
        (record.event !== null &&
            ((record.event.state === "sending") !== (record.event.token !== null) ||
                ["pending", "sending"].includes(record.event.state) !== (record.event.dueAt !== null))) ||
        (record.deleted && (record.answers.length || record.notification || record.intents.length || record.event)) ||
        (!record.deleted && (record.notification === null) !== (record.intents.length === 0)) ||
        record.intents.some(
            (intent) => (intent.state === "sending") !== (intent.lease !== null && intent.deadline !== null),
        )
    ) {
        throw new FormsError("CORE_UNAVAILABLE");
    }
    return record;
}
