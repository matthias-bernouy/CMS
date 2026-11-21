import { z } from "@bernouy/ulvia-sdk";
import { templateSchema, versionInputSchema } from "email-templates/schemas/templates";
import { contentSchema, revisionSchema } from "email-templates/schemas/content";
import type { TemplateRecord } from "email-templates/interfaces/TemplateStore";

export type StoredTemplate = TemplateRecord & { _id: string };
export const options = { maxTimeMS: 2000 };
const mutation = z.string().regex(/^[a-f0-9]{64}$/u);
const storedSchema = templateSchema.extend({
    format: z.literal("ulvia-email-template/v1"),
    revision: revisionSchema.min(1),
    lastMutation: mutation,
    pendingPublication: z
        .strictObject({ version: versionInputSchema.shape.version, revision: revisionSchema.min(1), mutation })
        .optional(),
});
const publicationRecordSchema = z.strictObject({
    format: z.literal("ulvia-email-template-publication/v1"),
    templateId: versionInputSchema.shape.id,
    version: versionInputSchema.shape.version,
    revision: revisionSchema.min(1),
    mutation,
    locale: templateSchema.shape.locale,
    content: contentSchema,
});
export type StoredPublication = z.infer<typeof publicationRecordSchema> & { _id: string };
export function decodeRecord(row: StoredTemplate): TemplateRecord {
    if (row._id !== row.id) {
        throw new TypeError("Invalid email template identity");
    }
    const { _id: _id, ...data } = row;
    const record = storedSchema.parse(data);
    const pending = record.pendingPublication;
    if (
        pending &&
        (record.archived || pending.revision !== record.revision || pending.version !== record.latestVersion + 1)
    ) {
        throw new TypeError("Invalid pending email publication");
    }
    return record;
}
export function decodePublication(row: StoredPublication) {
    const { _id: _id, ...data } = row;
    const publication = publicationRecordSchema.parse(data);
    if (row._id !== `${publication.templateId}@${publication.version}`) {
        throw new TypeError("Invalid email publication identity");
    }
    return publication;
}
export function decodeView(row: StoredTemplate, summary = false) {
    if (row._id !== row.id || row.format !== "ulvia-email-template/v1") {
        throw new TypeError("Invalid email template identity or format");
    }
    const { _id: _id, format: _format, ...data } = row;
    return summary ? templateSchema.omit({ draft: true }).parse(data) : templateSchema.parse(data);
}
