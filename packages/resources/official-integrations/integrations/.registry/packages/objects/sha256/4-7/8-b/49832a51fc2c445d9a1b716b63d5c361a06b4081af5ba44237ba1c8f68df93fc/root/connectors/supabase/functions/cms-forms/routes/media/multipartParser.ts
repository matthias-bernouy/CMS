import { HttpError } from "../../http.ts";

export type MultipartFile = { bytes: Uint8Array; filename: string };

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function parseSingleMultipartFile(bytes: Uint8Array, boundary: string, maximum: number): MultipartFile {
    const marker = encoder.encode(`--${boundary}`);
    const delimiter = encoder.encode(`\r\n--${boundary}`);
    if (!matchesAt(bytes, marker, 0)) {
        throw new HttpError(400, "invalid multipart body");
    }
    let cursor = marker.length;
    let file: MultipartFile | null = null;
    for (;;) {
        if (matchesAscii(bytes, "--", cursor)) {
            break;
        }
        if (!matchesAscii(bytes, "\r\n", cursor)) {
            throw new HttpError(400, "invalid multipart body");
        }
        cursor += 2;
        const headerEnd = indexOf(bytes, encoder.encode("\r\n\r\n"), cursor);
        if (headerEnd < 0 || headerEnd - cursor > 16 * 1024) {
            throw new HttpError(400, "invalid multipart headers");
        }
        const disposition = dispositionHeader(decoder.decode(bytes.subarray(cursor, headerEnd)));
        const contentStart = headerEnd + 4;
        const nextBoundary = indexOf(bytes, delimiter, contentStart);
        if (nextBoundary < 0) {
            throw new HttpError(400, "invalid multipart body");
        }
        if (disposition.filename !== null) {
            if (disposition.name !== "file" || file) {
                throw new HttpError(400, "exactly one file is required");
            }
            const contents = bytes.slice(contentStart, nextBoundary);
            if (!contents.byteLength) {
                throw new HttpError(400, "file is empty");
            }
            if (contents.byteLength > maximum) {
                throw new HttpError(413, "file is too large");
            }
            file = { bytes: contents, filename: safeFilename(disposition.filename) };
        }
        cursor = nextBoundary + 2 + marker.length;
    }
    if (!file) {
        throw new HttpError(400, "file is required");
    }
    return file;
}

function dispositionHeader(value: string): { filename: string | null; name: string | null } {
    const line = value.split("\r\n").find((candidate) => /^content-disposition:/i.test(candidate));
    if (!line || !/^content-disposition:\s*form-data(?:;|$)/i.test(line)) {
        throw new HttpError(400, "invalid multipart disposition");
    }
    return { filename: parameter(line, "filename"), name: parameter(line, "name") };
}

function parameter(value: string, name: string): string | null {
    const match = new RegExp(`(?:^|;)\\s*${name}=(?:"((?:[^"\\\\]|\\\\.)*)"|([^;]*))`, "i").exec(value);
    const result = match?.[1] === undefined ? (match?.[2] ?? "").trim() : match[1].replace(/\\(.)/g, "$1");
    if (!match) {
        return null;
    }
    if (/[\r\n\x00]/.test(result)) {
        throw new HttpError(400, "invalid multipart disposition");
    }
    return result;
}

function safeFilename(value: string): string {
    return value.split(/[\\/]/).at(-1)?.trim().slice(0, 500) || "image";
}

function indexOf(haystack: Uint8Array, needle: Uint8Array, start: number): number {
    outer: for (let index = start; index <= haystack.length - needle.length; index++) {
        for (let offset = 0; offset < needle.length; offset++) {
            if (haystack[index + offset] !== needle[offset]) {
                continue outer;
            }
        }
        return index;
    }
    return -1;
}

function matchesAt(bytes: Uint8Array, value: Uint8Array, offset: number): boolean {
    return value.every((byte, index) => bytes[offset + index] === byte);
}

function matchesAscii(bytes: Uint8Array, value: string, offset: number): boolean {
    return matchesAt(bytes, encoder.encode(value), offset);
}
