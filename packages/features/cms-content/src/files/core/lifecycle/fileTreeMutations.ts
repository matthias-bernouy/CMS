import type { CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type {
    CmsFilesMetadataRepository,
    FilesItem,
    FolderItem,
    ItemPatch,
    NewFolder,
} from "cms-content/files/interfaces/CmsFilesMetadataRepository";

export function createFileFolder(
    metadata: CmsFilesMetadataRepository,
    journal: CmsFileMutationJournal,
    input: NewFolder,
): Promise<FolderItem> {
    return journal.withTreeWrite(() => metadata.createFolder(input));
}

export function updateFileItem(
    metadata: CmsFilesMetadataRepository,
    journal: CmsFileMutationJournal,
    id: string,
    patch: ItemPatch,
    expectedRevision?: number,
): Promise<FilesItem | null> {
    return journal.withTreeWrite(() => metadata.updateItem(id, patch, expectedRevision));
}
