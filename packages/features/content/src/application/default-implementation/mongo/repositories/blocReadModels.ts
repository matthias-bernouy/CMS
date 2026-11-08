import type { ClientSession, Collection } from "mongodb";
import { SiteBlocNotFoundError } from "content/application/core/validation/errors";
import type { BlocListOptions } from "content/application/interfaces/ContentRepository";
import type { BlocListRecord } from "content/application/core/projectBlocList";
import type { BlocRecord } from "content/blocs/interfaces/blocs";
import { type BlocDoc, fromBlocDoc } from "content/application/default-implementation/mongo/repositories/documents";

export async function requireBlocRecord(
    blocs: Collection<BlocDoc>,
    tag: string,
    session?: ClientSession,
): Promise<BlocRecord> {
    const record = fromBlocDoc(await blocs.findOne({ _id: tag }, session ? { session } : undefined));
    if (!record) {
        throw new SiteBlocNotFoundError(tag);
    }
    return record;
}

const renderingFields = [
    "id",
    "kind",
    "name",
    "group",
    "categories",
    "catalogueOrder",
    "description",
    "catalogue",
    "uses",
    "requires",
    "root",
    "styleCSS",
    "styleCollectionId",
    "markupHTML",
    "browser",
    "ownership",
] as const;
const editorFields = ["initialDocument", "defaultContent", "slots", "settings", "thumbnail"] as const;
type BlocListDocument = Omit<BlocListRecord, "tag"> & { _id: string };

/** Keep full artifacts available only through explicit artifact/source/behavior reads. */
export async function readBlocListRecords(
    blocs: Collection<BlocDoc>,
    options: BlocListOptions,
): Promise<BlocListRecord[]> {
    const fields = options.projection === "rendering" ? renderingFields : [...renderingFields, ...editorFields];
    const records = await blocs
        .find<BlocListDocument>(
            {},
            {
                projection: {
                    _id: 1,
                    ownership: 1,
                    "siteDefinition.publishedRevision": 1,
                    hasBehavior: { $ne: [{ $ifNull: ["$artifact.viewJS", ""] }, ""] },
                    ...Object.fromEntries(fields.map((field) => [`artifact.${field}`, 1])),
                },
            },
        )
        .toArray();
    return records.map(({ _id, ...record }) => ({ ...record, tag: _id }));
}
