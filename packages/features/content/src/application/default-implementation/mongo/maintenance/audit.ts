import { isDeepStrictEqual } from "node:util";
import type { Db } from "mongodb";
import { ContentStorageFormatError } from "content/application/core/validation/errors";
import { pageContentReferenceKeys } from "content/pages/core/queries/contentReferences";
import { referenceProjection, scanMaintenanceDocuments, upgradeBlocRecord } from "./records";
import type { MaintenanceDocument } from "./records";

export async function auditMongoContentReferences(
    db: Db,
    prefix: string,
    assertHeld: () => Promise<void>,
    external?: (tag: string) => Promise<boolean>,
) {
    const blocs = db.collection<MaintenanceDocument>(prefix + "blocs");
    const pages = db.collection<MaintenanceDocument>(prefix + "pages");
    const available = new Map<string, boolean>();
    const requirePublished = async (tag: string) => {
        if (!available.has(tag)) {
            const target = await blocs.findOne(
                { _id: tag },
                { projection: { _id: 1, artifact: 1, "siteDefinition.publishedRevision": 1, ownership: 1 } },
            );
            const valid = target
                ? !!target.artifact &&
                  (target.ownership?.kind !== "site-builder" ||
                      Number.isSafeInteger(target.siteDefinition?.publishedRevision))
                : !!(await external?.(tag));
            if (available.size >= 512) {
                available.clear();
            }
            available.set(tag, valid);
        }
        if (!available.get(tag)) {
            throw new ContentStorageFormatError(`Published Bloc reference cannot be resolved: ${tag}`);
        }
    };
    let checked = 0;
    for await (const row of scanMaintenanceDocuments(blocs)) {
        await assertHeld();
        if (!isDeepStrictEqual(row.contentReferences, referenceProjection(row))) {
            throw new ContentStorageFormatError(`Invalid Bloc reference projection: ${row._id}`);
        }
        const record = upgradeBlocRecord(row);
        // Drafts intentionally allow future unresolved dependencies; publications do not.
        const published = {
            ...record,
            ...(record.siteDefinition
                ? {
                      siteDefinition: {
                          ...record.siteDefinition,
                          draft: record.siteDefinition.published ?? {
                              ...record.siteDefinition.draft,
                              dependencies: [],
                              defaultContent: "",
                          },
                      },
                  }
                : {}),
        };
        const projected = referenceProjection({ ...row, ...published, _id: row._id });
        for (const key of projected) {
            if (key.startsWith("bloc:")) {
                await requirePublished(key.slice(5));
            }
        }
        checked++;
    }
    for await (const row of scanMaintenanceDocuments(pages)) {
        await assertHeld();
        if (
            typeof row.content !== "string" ||
            !Number.isSafeInteger(row.revision) ||
            !isDeepStrictEqual(row.contentReferences, pageContentReferenceKeys(row.content))
        ) {
            throw new ContentStorageFormatError(`Invalid Page reference projection: ${row._id}`);
        }
        for (const key of row.contentReferences) {
            if (key.startsWith("bloc:")) {
                await requirePublished(key.slice(5));
            }
        }
        checked++;
    }
    return checked;
}
