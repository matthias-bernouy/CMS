import { z } from "@bernouy/ulvia-sdk";
import { answerSchema } from "forms/application/schemas/public";
import { uuidSchema, revisionSchema } from "forms/application/schemas/authoring";
import { submissionStatusSchema } from "forms/application/schemas/submissions";
import { lossless } from "forms/core/inputBounds";
import { FormsError } from "forms/core/errors";

const date = z
    .string()
    .length(24)
    .refine(
        (value) =>
            /^\d{4}-/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    );
const legacySubmissionSchema = z.strictObject({
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
export function legacySubmission(value: unknown, version: "1.0.0" | "1.1.0") {
    const schema = version === "1.0.0" ? legacySubmissionSchema.omit({ event: true }) : legacySubmissionSchema;
    const row = schema.parse(value);
    if (
        !lossless(row) ||
        (row.deleted && (row.answers.length || row.notification || row.intents.length)) ||
        (!row.deleted && (row.notification === null) !== (row.intents.length === 0)) ||
        row.intents.some(
            (intent) => (intent.state === "sending") !== (intent.lease !== null && intent.deadline !== null),
        )
    ) {
        throw new FormsError("CORE_UNAVAILABLE");
    }
    return row;
}
