import type { Collection } from "mongodb";
import type { TemplateRecord } from "email-templates/interfaces/TemplateStore";
import type { StoredTemplate, StoredPublication } from "./records";
import { decodeRecord, decodePublication, options } from "./records";

/** Reserve one immutable draft, insert its publication, then make the version visible by model CAS. */
export async function publishTemplate(
    models: Collection<StoredTemplate>,
    publications: Collection<StoredPublication>,
    next: TemplateRecord,
    expectedRevision: number,
): Promise<boolean> {
    const pending = { version: next.latestVersion, revision: expectedRevision, mutation: next.lastMutation };
    let row = await models.findOneAndUpdate(
        {
            _id: next.id,
            revision: expectedRevision,
            archived: false,
            latestVersion: next.latestVersion - 1,
            pendingPublication: { $exists: false },
        },
        { $set: { pendingPublication: pending } },
        { ...options, returnDocument: "after" },
    );
    row ??= await models.findOne({ _id: next.id }, options);
    if (!row) {
        return false;
    }
    const current = decodeRecord(row);
    if (completed(current, next)) {
        return true;
    }
    if (current.revision !== expectedRevision || current.pendingPublication?.mutation !== pending.mutation) {
        return false;
    }
    const publication: StoredPublication = {
        _id: `${next.id}@${pending.version}`,
        format: "ulvia-email-template-publication/v1",
        templateId: next.id,
        version: pending.version,
        revision: expectedRevision,
        mutation: pending.mutation,
        locale: current.locale,
        content: current.draft,
    };
    try {
        await publications.insertOne(publication);
    } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
            throw error;
        }
        const existing = await publications.findOne({ _id: publication._id }, options);
        if (
            !existing ||
            JSON.stringify(decodePublication(existing)) !== JSON.stringify(decodePublication(publication))
        ) {
            throw new TypeError("An immutable email publication disagrees with its reserved operation");
        }
    }
    const result = await models.updateOne(
        { _id: next.id, revision: expectedRevision, pendingPublication: pending },
        {
            $set: { revision: next.revision, latestVersion: next.latestVersion, lastMutation: next.lastMutation },
            $unset: { pendingPublication: "" },
        },
        options,
    );
    if (result.matchedCount === 1) {
        return true;
    }
    const committed = await models.findOne({ _id: next.id }, options);
    return committed !== null && completed(decodeRecord(committed), next);
}
function completed(current: TemplateRecord, next: TemplateRecord) {
    return (
        current.revision === next.revision &&
        current.latestVersion === next.latestVersion &&
        current.lastMutation === next.lastMutation
    );
}
