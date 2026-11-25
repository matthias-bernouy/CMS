import { z, contractString } from "@bernouy/ulvia-sdk";
import { draftSchema, formSchema, versionSchema } from "forms/application/schemas/authoring";
import { submissionRecord } from "forms/persistence/codecs";
import { legacySubmission } from "./legacy";
const notification = z.strictObject({
    enabled: z.boolean(),
    recipients: z.array(z.strictObject({ email: contractString({ format: "email", maxLength: 320 }) })).max(8192),
    subjectTemplate: z.string().max(65536),
    textTemplate: z.string().max(65536),
    includeAnswers: z.boolean(),
});
const legacyDraft = draftSchema.extend({ notification });
const hash = z.string().regex(/^[a-f0-9]{64}$/u),
    uuid = z.string().uuid();
const storedForm = z.strictObject({
    _id: uuid,
    record: formSchema.extend({ draft: legacyDraft }),
    createDigest: hash,
    changeDigest: hash.nullable(),
    nonce: uuid,
});
const storedVersion = z.strictObject({
    _id: z.string().min(1).max(100),
    record: versionSchema.extend({ draft: legacyDraft }),
    committed: z.boolean(),
});
const envelope = z.strictObject({
    _id: uuid,
    record: z.unknown(),
    purgeAt: z.date(),
    nonce: uuid,
    dueAt: z.date().nullable(),
});
export type FormsV1Version = "1.0.0" | "1.1.0";
export function convertForm(value: unknown) {
    const row = storedForm.parse(value);
    if (row._id !== row.record.id) {
        throw new TypeError("Forms migration identity mismatch");
    }
    const { notification: settings, ...draft } = row.record.draft;
    const record = formSchema.parse({ ...row.record, draft });
    return { document: { ...row, record }, settings: { formId: row._id, publication: null, settings } };
}
export function convertVersion(value: unknown) {
    const row = storedVersion.parse(value);
    if (row._id !== `${row.record.formId}:${row.record.version}`) {
        throw new TypeError("Forms migration publication identity mismatch");
    }
    const { notification: settings, ...draft } = row.record.draft;
    return {
        document: { ...row, record: versionSchema.parse({ ...row.record, draft }) },
        settings: { formId: row.record.formId, publication: row.record.version, settings },
    };
}
export function convertSubmission(value: unknown, source: FormsV1Version) {
    const envelopeRow = envelope.parse(value),
        old = legacySubmission(envelopeRow.record, source);
    if (envelopeRow._id !== old.receiptId) {
        throw new TypeError("Forms migration submission identity mismatch");
    }
    if (old.deliveryMayComplete || old.intents.some((intent) => intent.state !== "accepted")) {
        throw new Error(`FORMS_EMAIL_UNRESOLVED:${old.receiptId}`);
    }
    const { notification: _notification, intents: _intents, deliveryMayComplete: _delivery, ...retained } = old;
    const record = submissionRecord({ ...retained, event: "event" in retained ? retained.event : null });
    const times = record.deleted
        ? []
        : [Date.parse(record.expiresAt), ...(record.event?.dueAt ? [Date.parse(record.event.dueAt)] : [])];
    return { ...envelopeRow, record, dueAt: times.length ? new Date(Math.min(...times)) : null };
}
