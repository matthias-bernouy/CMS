import type { StorageProvider } from "../../exports/StorageProvider";
import type { UpdateItemDto } from "../validation/content/parseUpdateItemDto";

/**
 * Resolves the post-update `(name, parentFolderID)` based on the patch and
 * the item's current state. Also verifies the destination folder exists in
 * the bucket. Used by both folder and file update paths.
 */
export async function resolveDestination(
    provider: StorageProvider,
    bucketId: string,
    selfId: string,
    dto: UpdateItemDto,
    kind: "folder" | "file",
): Promise<{ name: string; parentFolderID: string | null }> {
    const current = kind === "folder"
        ? await provider.storedFolderRepo.get(selfId)
        : await provider.storedFileRepo.get(selfId);
    if (!current) throw new Error(`Item "${selfId}" disappeared.`);
    const name           = dto.name           ?? current.name;
    const parentFolderID = dto.parentFolderID === undefined ? current.parentFolderID : dto.parentFolderID;
    if (parentFolderID !== null) {
        const parent = await provider.storedFolderRepo.get(parentFolderID);
        if (!parent || parent.bucketId !== bucketId) {
            throw new Error("destination_not_found: parent folder does not exist in this bucket.");
        }
    }
    return { name, parentFolderID };
}

export async function assertNameFree(
    provider: StorageProvider,
    bucketId: string,
    parentFolderID: string | null,
    name: string,
    selfId: string,
): Promise<void> {
    const folderClash = await provider.storedFolderRepo.getByName(bucketId, parentFolderID, name);
    if (folderClash && folderClash.id !== selfId) throw new Error(`Name "${name}" already taken (folder).`);
    const fileClash = await provider.storedFileRepo.getByName(bucketId, parentFolderID, name);
    if (fileClash && fileClash.id !== selfId) throw new Error(`Name "${name}" already taken (file).`);
}

/** Walks the parent chain from `candidateId` upward — returns true if
 *  `ancestorId` is reached within MAX_DEPTH hops. */
export async function isDescendantOrSelf(
    provider: StorageProvider,
    bucketId: string,
    ancestorId: string,
    candidateId: string,
): Promise<boolean> {
    let cursor: string | null = candidateId;
    for (let i = 0; i < 64 && cursor !== null; i++) {
        if (cursor === ancestorId) return true;
        const folder = await provider.storedFolderRepo.get(cursor);
        if (!folder || folder.bucketId !== bucketId) return false;
        cursor = folder.parentFolderID;
    }
    return false;
}
