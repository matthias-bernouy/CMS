import { HttpError } from "../core/errors.ts";
import { optionalText, readJsonObject, requiredId } from "../core/records.ts";
import { maxPhotoBytes } from "./constants.ts";
import { readSingleMultipartFile } from "./multipart.ts";
import { probePhoto } from "./probe/index.ts";

export type UploadedPhoto = {
    extension: string;
    file: File;
    height: number;
    mimeType: string;
    width: number;
};

export async function readPhoto(request: Request): Promise<UploadedPhoto> {
    const multipart = await readSingleMultipartFile(request, maxPhotoBytes);
    const detected = probePhoto(multipart.bytes);
    return {
        ...detected,
        file: new File([multipart.bytes], multipart.filename, { type: detected.mimeType }),
    };
}

export function photoPath(albumId: number, photo: UploadedPhoto): string {
    const date = new Date().toISOString().slice(0, 10);
    return `albums/${albumId}/${date}/${crypto.randomUUID()}${photo.extension}`;
}

export async function readPhotoIds(request: Request): Promise<number[]> {
    const body = await readJsonObject(request);
    if (!Array.isArray(body.photoIds)) {
        throw new HttpError(400, "photoIds must be an array");
    }
    const ids = body.photoIds.map((value, index) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number <= 0) {
            throw new HttpError(400, `photoIds[${index}] must be a positive integer`);
        }
        return number;
    });
    if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, "photoIds must be unique");
    }
    return ids;
}

export function photoUploadIds(request: Request): { albumId: number; replacePhotoId: number | null } {
    return {
        albumId: requiredId(request, "albumId"),
        replacePhotoId: optionalPositiveId(new URL(request.url).searchParams.get("photoId"), "photoId"),
    };
}

function optionalPositiveId(value: string | null, name: string): number | null {
    if (!optionalText(value, name)) {
        return null;
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) {
        throw new HttpError(400, `${name} must be a positive integer`);
    }
    return number;
}
