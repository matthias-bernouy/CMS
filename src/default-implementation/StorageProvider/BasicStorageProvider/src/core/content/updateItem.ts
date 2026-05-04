import type { StorageProvider } from "../../exports/StorageProvider";
import type { CDNItem } from "../../../../../../interfaces/CDN";
import type { StoredFile } from "../../interfaces/entities/StoredFile";
import type { UpdateItemDto } from "../validation/content/parseUpdateItemDto";
import { buildPublicURL } from "../upload/helpers";
import { resolveDestination, assertNameFree, isDescendantOrSelf } from "./updateItemHelpers";

/**
 * Renames / moves / re-slugs an item. Folders accept name + parentFolderID
 * (with cycle detection); files additionally accept publicPath
 * (`null` = clear). Order: validate → swap blob symlinks → write DB patch.
 */
export async function updateItem(
    provider: StorageProvider,
    bucketId: string,
    id: string,
    dto: UpdateItemDto,
): Promise<CDNItem> {
    const folder = await provider.storedFolderRepo.get(id);
    if (folder && folder.bucketId === bucketId) {
        if (dto.publicPath !== undefined) throw new Error("validation_error: folders have no publicPath.");
        return await applyFolderUpdate(provider, bucketId, folder.id, dto);
    }
    const file = await provider.storedFileRepo.get(id);
    if (file && file.bucketId === bucketId) {
        return await applyFileUpdate(provider, bucketId, file, dto);
    }
    throw new Error(`Item "${id}" not found in bucket "${bucketId}".`);
}

async function applyFolderUpdate(
    provider: StorageProvider,
    bucketId: string,
    folderId: string,
    dto: UpdateItemDto,
): Promise<CDNItem> {
    const target = await resolveDestination(provider, bucketId, folderId, dto, "folder");
    await assertNameFree(provider, bucketId, target.parentFolderID, target.name, folderId);
    if (dto.parentFolderID !== undefined && dto.parentFolderID !== null) {
        if (await isDescendantOrSelf(provider, bucketId, folderId, dto.parentFolderID)) {
            throw new Error("validation_error: cannot move a folder into itself or a descendant.");
        }
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name           !== undefined) patch.name           = dto.name;
    if (dto.parentFolderID !== undefined) patch.parentFolderID = dto.parentFolderID;
    await provider.storedFolderRepo.update(folderId, patch as never);
    const fresh = await provider.storedFolderRepo.get(folderId);
    if (!fresh) throw new Error(`Folder "${folderId}" disappeared during update.`);
    return fresh;
}

async function applyFileUpdate(
    provider: StorageProvider,
    bucketId: string,
    file: StoredFile,
    dto: UpdateItemDto,
): Promise<CDNItem> {
    const target = await resolveDestination(provider, bucketId, file.id, dto, "file");
    await assertNameFree(provider, bucketId, target.parentFolderID, target.name, file.id);

    const oldPublicPath = file.publicPath;
    const newPublicPath = dto.publicPath === undefined ? oldPublicPath : (dto.publicPath ?? undefined);
    if (newPublicPath !== oldPublicPath && newPublicPath !== undefined) {
        const clash = await provider.storedFileRepo.getByPublicPath(bucketId, newPublicPath);
        if (clash && clash.id !== file.id) throw new Error(`publicPath "${newPublicPath}" already taken.`);
        await provider.blobStorage.setPublicPath(bucketId, newPublicPath, file.storagePath);
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (dto.name           !== undefined) patch.name           = dto.name;
    if (dto.parentFolderID !== undefined) patch.parentFolderID = dto.parentFolderID;
    if (newPublicPath !== oldPublicPath) {
        patch.publicPath  = newPublicPath ?? null;
        patch.absoluteURL = buildPublicURL(provider, bucketId, newPublicPath ?? file.storagePath);
    }
    await provider.storedFileRepo.update(file.id, patch as never);
    if (newPublicPath !== oldPublicPath && oldPublicPath !== undefined) {
        await provider.blobStorage.clearPublicPath(bucketId, oldPublicPath).catch(() => {});
    }
    const fresh = await provider.storedFileRepo.get(file.id);
    if (!fresh) throw new Error(`File "${file.id}" disappeared during update.`);
    return fresh;
}
