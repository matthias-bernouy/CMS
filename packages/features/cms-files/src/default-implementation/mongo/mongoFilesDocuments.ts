import type { FilesItem } from "cms-files/interfaces/CmsFilesMetadataRepository";

/** Preserve each member of the FilesItem union when replacing `id` with `_id`. */
type ToDocument<T> = T extends { id: string } ? Omit<T, "id"> & { _id: string } : never;

export type FilesItemDocument = ToDocument<FilesItem>;

export function fromDocument(document: FilesItemDocument): FilesItem {
    const { _id, ...item } = document;
    return { id: _id, ...item } as FilesItem;
}

export function fileNameClashOr(error: unknown): unknown {
    if (error && typeof error === "object" && (error as { code?: number }).code === 11000) {
        return new Error("name already exists in the destination folder");
    }
    return error;
}
