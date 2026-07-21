import { HttpError } from "../../core/errors.ts";
import { integer, readJsonObject } from "../../core/records.ts";
import { maxProductImageBytes, productImageTypes } from "./media-constants.ts";

export function requiredQueryId(request: Request, name: string, fallback?: string): number {
    const params = new URL(request.url).searchParams;
    const value = params.get(name) ?? (fallback ? params.get(fallback) : null);
    const id = integer(value, name, true)!;
    if (id <= 0) {
        throw new HttpError(400, `${name} must be positive`);
    }
    return id;
}

export async function readCommerceImage(request: Request): Promise<File> {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
        throw new HttpError(400, "image upload must use multipart/form-data");
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        throw new HttpError(400, "invalid multipart body");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
        throw new HttpError(400, "file is required");
    }
    if (file.size <= 0) {
        throw new HttpError(400, "file is empty");
    }
    if (file.size > maxProductImageBytes) {
        throw new HttpError(413, "file is too large");
    }
    if (!productImageTypes.has(file.type.toLowerCase())) {
        throw new HttpError(400, "file must be a JPEG, PNG, WebP, GIF, or AVIF image");
    }
    return file;
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

export function productImagePath(productId: number, file: File): string {
    return commerceImagePath("products", productId, file);
}

export function offerImagePath(offerId: number, file: File): string {
    return commerceImagePath("offers", offerId, file);
}

function commerceImagePath(owner: "products" | "offers", ownerId: number, file: File): string {
    const extension = productImageTypes.get(file.type.toLowerCase());
    if (!extension) {
        throw new HttpError(400, "unsupported image content type");
    }
    const date = new Date().toISOString().slice(0, 10);
    return `${owner}/${ownerId}/${date}/${crypto.randomUUID()}${extension}`;
}
