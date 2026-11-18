import type { Collection, Document } from "mongodb";
import type { BlocRecord } from "content/blocs/interfaces/blocs";
import { blocReferenceTags } from "content/blocs/core/catalogue/editing/references";

export type MaintenanceDocument = Document & { _id: string };

/** This explicit upgrade reads the previous v1 projection shape without changing authored data. */
export function upgradeBlocRecord(document: MaintenanceDocument): BlocRecord {
    if (
        typeof document._id !== "string" ||
        !document.ownership ||
        !["site-builder", "code-managed"].includes(document.ownership.kind)
    ) {
        throw new TypeError("Invalid stored Bloc identity or ownership");
    }
    if (!Object.hasOwn(document, "artifact") || (document.artifact !== null && typeof document.artifact !== "object")) {
        throw new TypeError("Invalid stored Bloc artifact");
    }
    const record = {
        tag: document._id,
        ownership: document.ownership,
        artifact: document.artifact,
        ...(document.siteDefinition ? { siteDefinition: document.siteDefinition } : {}),
    } as BlocRecord;
    if (record.ownership.kind === "code-managed" && !record.artifact) {
        throw new TypeError("A code-managed Bloc requires its artifact");
    }
    if (record.artifact && (record.artifact.id !== record.tag || typeof record.artifact.markupHTML !== "string")) {
        throw new TypeError("Invalid stored Bloc artifact identity or markup");
    }
    if (
        record.ownership.kind === "site-builder" &&
        (!record.siteDefinition ||
            record.siteDefinition.schema !== "cms.site-bloc.v1" ||
            !record.siteDefinition.draft ||
            !Object.hasOwn(record.siteDefinition, "published") ||
            !Number.isSafeInteger(record.siteDefinition.draftRevision) ||
            record.siteDefinition.draftRevision < 1 ||
            record.siteDefinition.id !== record.ownership.definitionId ||
            record.siteDefinition.tag !== record.tag)
    ) {
        throw new TypeError("Invalid stored site composition identity");
    }
    for (const snapshot of [record.siteDefinition?.draft, record.siteDefinition?.published]) {
        if (!snapshot) {
            continue;
        }
        if (
            !Array.isArray(snapshot.structure) ||
            !Array.isArray(snapshot.slots) ||
            typeof snapshot.name !== "string" ||
            typeof snapshot.group !== "string" ||
            typeof snapshot.description !== "string" ||
            !Array.isArray(snapshot.dependencies) ||
            snapshot.dependencies.some((tag) => typeof tag !== "string") ||
            typeof snapshot.defaultContent !== "string"
        ) {
            throw new TypeError("Invalid stored composition reference source");
        }
    }
    if (
        record.artifact?.uses &&
        (!Array.isArray(record.artifact.uses) || record.artifact.uses.some((tag) => typeof tag !== "string"))
    ) {
        throw new TypeError("Invalid stored Bloc dependencies");
    }
    for (const value of [
        record.artifact?.markupHTML,
        record.artifact?.defaultContent,
        record.artifact?.initialDocument?.html,
    ]) {
        if (value !== undefined && typeof value !== "string") {
            throw new TypeError("Invalid stored Bloc markup");
        }
    }
    return record;
}

export function referenceProjection(document: MaintenanceDocument): readonly string[] {
    return blocReferenceTags(upgradeBlocRecord(document)).map((tag) => `bloc:${tag}`);
}

/** One BSON document at a time, including on refusal, cancellation and early exit. */
export async function* scanMaintenanceDocuments(
    collection: Collection<MaintenanceDocument>,
    after: string | null = null,
) {
    const cursor = collection
        .find(after === null ? {} : { _id: { $gt: after } })
        .sort({ _id: 1 })
        .batchSize(1);
    try {
        while (await cursor.hasNext()) {
            const row = await cursor.next();
            if (row) {
                yield row;
            }
        }
    } finally {
        await cursor.close();
    }
}
