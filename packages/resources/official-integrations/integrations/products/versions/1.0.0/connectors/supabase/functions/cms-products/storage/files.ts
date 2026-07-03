import { HttpError } from "../core/errors.ts";
import { mediaContentTypes, maxMediaBytes } from "./constants.ts";

export async function readUploadFile(request: Request): Promise<File> {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
        throw new HttpError(400, "media upload must use multipart/form-data");
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        throw new HttpError(400, "invalid multipart body");
    }

    const value = formData.get("file");
    if (!(value instanceof File)) throw new HttpError(400, "file is required");
    if (value.size <= 0) throw new HttpError(400, "file is empty");
    if (value.size > maxMediaBytes) throw new HttpError(413, "file is too large");
    if (!mediaContentTypes.has(value.type.toLowerCase())) {
        throw new HttpError(400, "file must be a JPEG, PNG, WebP, GIF, or AVIF image");
    }
    return value;
}

export function mediaObjectPath(file: File): string {
    const extension = mediaContentTypes.get(file.type.toLowerCase());
    if (!extension) throw new HttpError(400, "unsupported media content type");
    const date = new Date().toISOString().slice(0, 10);
    return `media/${date}/${crypto.randomUUID()}${extension}`;
}
