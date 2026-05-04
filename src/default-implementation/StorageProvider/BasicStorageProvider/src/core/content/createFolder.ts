import type { StorageProvider } from "../../exports/StorageProvider";
import type { StoredFolder } from "../../interfaces/entities/StoredFolder";
import type { FolderCreateDto } from "../validation/content/parseCreateFolderDto";
import { generateId } from "../ids";

export async function createFolder(
    provider: StorageProvider,
    bucketId: string,
    dto: FolderCreateDto,
): Promise<StoredFolder> {
    const bucket = await provider.bucketRepo.get(bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);

    if (dto.parentFolderID !== null) {
        const parent = await provider.storedFolderRepo.get(dto.parentFolderID);
        if (!parent || parent.bucketId !== bucketId) {
            throw new Error("destination_not_found: parent folder does not exist in this bucket.");
        }
    }

    // Cross-namespace uniqueness — folders and files share the same name slot.
    const folderClash = await provider.storedFolderRepo.getByName(bucketId, dto.parentFolderID, dto.name);
    if (folderClash) throw new Error(`Name "${dto.name}" already taken (folder).`);
    const fileClash = await provider.storedFileRepo.getByName(bucketId, dto.parentFolderID, dto.name);
    if (fileClash) throw new Error(`Name "${dto.name}" already taken (file).`);

    const now = new Date();
    const folder: StoredFolder = {
        type: "folder",
        id: generateId(),
        bucketId,
        name: dto.name,
        parentFolderID: dto.parentFolderID,
        createdAt: now,
        updatedAt: now,
    };

    await provider.storedFolderRepo.create(folder);
    return folder;
}
