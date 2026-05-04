import type { StorageProvider } from "../../../exports/StorageProvider";
import type { PreSignedToken } from "../../../interfaces/entities/PreSignedToken";
import { generateId } from "../../ids";
import { mimeMatches } from "../../validation/upload/mimeType";
import type { MintTokenDto } from "./parseMintDto";

/**
 * Mints a single-use upload authorization for a future browser→provider
 * upload via `POST /upload?token=<id>`. Pre-flight checks are run now so the
 * caller (broker) gets a structured error before exposing anything to the
 * end user; the actual quota / size check happens again in `uploadFile`
 * since the bucket state can change between mint and upload.
 */
export async function mintToken(
    provider: StorageProvider,
    bucketId: string,
    dto: MintTokenDto,
): Promise<PreSignedToken> {
    const bucket = await provider.bucketRepo.get(bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);

    if (dto.maxSize > bucket.limits.maxFileSize) {
        throw new Error(`maxSize (${dto.maxSize}) exceeds bucket maxFileSize (${bucket.limits.maxFileSize}).`);
    }

    if (dto.contentType !== undefined && !mimeMatches(dto.contentType, bucket.limits.acceptedMimeTypes)) {
        throw new Error(`unsupported_mime_type: "${dto.contentType}" not in bucket whitelist.`);
    }

    if (dto.parentFolderID !== null) {
        const parent = await provider.storedFolderRepo.get(dto.parentFolderID);
        if (!parent || parent.bucketId !== bucketId) {
            throw new Error("destination_not_found: parent folder does not exist in this bucket.");
        }
    }

    const folderClash = await provider.storedFolderRepo.getByName(bucketId, dto.parentFolderID, dto.name);
    if (folderClash) throw new Error(`Name "${dto.name}" already taken (folder).`);
    const fileClash = await provider.storedFileRepo.getByName(bucketId, dto.parentFolderID, dto.name);
    if (fileClash) throw new Error(`Name "${dto.name}" already taken (file).`);

    if (dto.publicPath !== undefined) {
        const slugClash = await provider.storedFileRepo.getByPublicPath(bucketId, dto.publicPath);
        if (slugClash) throw new Error(`publicPath "${dto.publicPath}" already taken.`);
    }

    const now = new Date();
    const token: PreSignedToken = {
        id:             generateId(),
        bucketId,
        parentFolderID: dto.parentFolderID,
        name:           dto.name,
        maxSize:        dto.maxSize,
        expiresAt:      new Date(now.getTime() + dto.ttlSec * 1000),
        createdAt:      now,
        ...(dto.contentType !== undefined ? { contentType: dto.contentType } : {}),
        ...(dto.publicPath  !== undefined ? { publicPath:  dto.publicPath  } : {}),
    };

    await provider.preSignedTokenRepo.create(token);
    return token;
}
