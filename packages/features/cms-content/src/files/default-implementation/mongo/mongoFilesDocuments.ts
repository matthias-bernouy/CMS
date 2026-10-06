import type { FilesItem } from "cms-content/files/interfaces/CmsFilesMetadataRepository";
import { fileRepresentationVersion } from "cms-content/files/core/media/fileIntegrity";

/** Preserve each member of the FilesItem union when replacing `id` with `_id`. */
type ToDocument<T> = T extends { id: string } ? Omit<T, "id"> & { _id: string } : never;

export type FilesItemDocument = ToDocument<FilesItem>;

export function fromDocument(document: FilesItemDocument): FilesItem {
    const { _id, ...item } = document;
    const revision = Number.isSafeInteger(item.revision) ? item.revision : 1;
    if (item.type === "file") {
        return {
            id: _id,
            ...item,
            revision,
            representationVersion: fileRepresentationVersion(item) ?? undefined,
        };
    }
    return { id: _id, ...item, revision };
}

export function fileNameClashOr(error: unknown): unknown {
    if (error && typeof error === "object" && (error as { code?: number }).code === 11000) {
        return new Error("name already exists in the destination folder");
    }
    return error;
}
