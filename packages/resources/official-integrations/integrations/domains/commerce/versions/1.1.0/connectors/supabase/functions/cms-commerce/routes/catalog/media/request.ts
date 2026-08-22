import { HttpError } from "../../../core/errors.ts";
import { integer, readJsonObject } from "../../../core/records.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { maxProductImageBytes } from "./constants.ts";
import { readSingleMultipartFile } from "./multipart.ts";
import { probeCommerceImage } from "./probe/index.ts";
import type { ProbedImage } from "./probe/index.ts";

export type CommerceImage = ProbedImage & {
    file: File;
};

export function requiredQueryId(request: Request, name: string, fallback?: string): number {
    const params = new URL(request.url).searchParams;
    const value = params.get(name) ?? (fallback ? params.get(fallback) : null);
    const id = integer(value, name, true)!;
    if (id <= 0) {
        throw new HttpError(400, `${name} must be positive`);
    }
    return id;
}

export async function readCommerceImage(request: Request): Promise<CommerceImage> {
    const multipart = await readSingleMultipartFile(request, maxProductImageBytes);
    const detected = probeCommerceImage(multipart.bytes);
    return {
        ...detected,
        file: new File([multipart.bytes], multipart.filename, {
            type: detected.mimeType,
        }),
    };
}

export function requireMediaUploadAuthorization(
    result: JsonRecord,
    ownerKey: "offer_id" | "product_id",
    ownerId: number,
    replaceMediaId: number | null,
    rpcName: string,
): void {
    if (result.state !== "authorized" || result[ownerKey] !== ownerId || result.replace_media_id !== replaceMediaId) {
        throw new HttpError(502, `${rpcName} returned an invalid authorization response`);
    }
}

export async function readMediaIds(request: Request): Promise<number[]> {
    const body = await readJsonObject(request);
    if (!Array.isArray(body.mediaIds)) {
        throw new HttpError(400, "mediaIds must be an array");
    }
    const ids = body.mediaIds.map((value, index) => {
        const id = integer(value, `mediaIds[${index}]`, true)!;
        if (id <= 0) {
            throw new HttpError(400, `mediaIds[${index}] must be positive`);
        }
        return id;
    });
    if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, "mediaIds must be unique");
    }
    return ids;
}

export function productImagePath(productId: number, image: CommerceImage): string {
    return commerceImagePath("products", productId, image);
}

export function offerImagePath(offerId: number, image: CommerceImage): string {
    return commerceImagePath("offers", offerId, image);
}

function commerceImagePath(owner: "products" | "offers", ownerId: number, image: CommerceImage): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${owner}/${ownerId}/${date}/${crypto.randomUUID()}${image.extension}`;
}
