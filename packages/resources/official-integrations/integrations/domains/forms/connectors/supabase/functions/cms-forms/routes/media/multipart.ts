import { HttpError } from "../../http.ts";
import { maxMultipartOverheadBytes } from "./constants.ts";
import { parseSingleMultipartFile, type MultipartFile } from "./multipartParser.ts";

export async function readSingleMultipartFile(request: Request, maxFileBytes: number): Promise<MultipartFile> {
    const boundary = multipartBoundary(request.headers.get("content-type"));
    const maxBodyBytes = maxFileBytes + maxMultipartOverheadBytes;
    rejectKnownOversize(request, maxBodyBytes);
    return parseSingleMultipartFile(await readBoundedBody(request, maxBodyBytes), boundary, maxFileBytes);
}

function multipartBoundary(contentType: string | null): string {
    if (!contentType || !/^multipart\/form-data(?:;|$)/i.test(contentType.trim())) {
        throw new HttpError(400, "image upload must use multipart/form-data");
    }
    const match = /;\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
    if (!boundary || boundary.length > 70 || /[\r\n\x00-\x1f\x7f]/.test(boundary)) {
        throw new HttpError(400, "invalid multipart boundary");
    }
    return boundary;
}

function rejectKnownOversize(request: Request, maximum: number): void {
    const raw = request.headers.get("content-length")?.trim();
    if (raw && /^[0-9]+$/.test(raw) && Number(raw) > maximum) {
        void request.body?.cancel("multipart body exceeds the configured limit").catch(() => undefined);
        throw new HttpError(413, "file is too large");
    }
}

async function readBoundedBody(request: Request, maximum: number): Promise<Uint8Array> {
    if (!request.body) {
        throw new HttpError(400, "invalid multipart body");
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) {
                break;
            }
            total += result.value.byteLength;
            if (total > maximum) {
                await reader.cancel("multipart body exceeds the configured limit").catch(() => undefined);
                throw new HttpError(413, "file is too large");
            }
            chunks.push(result.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
