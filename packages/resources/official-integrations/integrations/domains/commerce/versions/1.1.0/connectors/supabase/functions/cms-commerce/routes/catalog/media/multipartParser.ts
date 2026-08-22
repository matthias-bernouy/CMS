import { HttpError } from "../../../core/errors.ts";

export type MultipartFile = {
    bytes: Uint8Array;
    filename: string;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const maxHeaderBytes = 16 * 1024;

export function parseSingleMultipartFile(bytes: Uint8Array, boundary: string, maxFileBytes: number): MultipartFile {
    const marker = encoder.encode(`--${boundary}`);
    const delimiter = encoder.encode(`\r\n--${boundary}`);
    if (!matchesAt(bytes, marker, 0)) {
        throw new HttpError(400, "invalid multipart body");
    }
    let cursor = marker.length;
    let file: MultipartFile | null = null;
    for (;;) {
        if (matchesAscii(bytes, "--", cursor)) {
            cursor += 2;
            if (cursor === bytes.length) {
                break;
            }
            if (!matchesAscii(bytes, "\r\n", cursor) || cursor + 2 !== bytes.length) {
                throw new HttpError(400, "invalid multipart body");
            }
            break;
        }
        if (!matchesAscii(bytes, "\r\n", cursor)) {
            throw new HttpError(400, "invalid multipart body");
        }
        cursor += 2;
        const headerEnd = indexOf(bytes, encoder.encode("\r\n\r\n"), cursor);
        if (headerEnd < 0 || headerEnd - cursor > maxHeaderBytes) {
            throw new HttpError(400, "invalid multipart headers");
        }
        const headers = parseHeaders(bytes.subarray(cursor, headerEnd));
        const contentStart = headerEnd + 4;
        const nextBoundary = indexOf(bytes, delimiter, contentStart);
        if (nextBoundary < 0) {
            throw new HttpError(400, "invalid multipart body");
        }
        const disposition = contentDisposition(headers.get("content-disposition"));
        if (disposition.filename !== null) {
            if (disposition.name !== "file" || file) {
                throw new HttpError(400, "exactly one file is required");
            }
            const contents = bytes.slice(contentStart, nextBoundary);
            if (contents.byteLength === 0) {
                throw new HttpError(400, "file is empty");
            }
            if (contents.byteLength > maxFileBytes) {
                throw new HttpError(413, "file is too large");
            }
            file = {
                bytes: contents,
                filename: safeFilename(disposition.filename),
            };
        }
        cursor = nextBoundary + 2 + marker.length;
    }
    if (!file) {
        throw new HttpError(400, "file is required");
    }
    return file;
}

function parseHeaders(bytes: Uint8Array): Map<string, string> {
    const value = decoder.decode(bytes);
    const headers = new Map<string, string>();
    for (const line of value.split("\r\n")) {
        const separator = line.indexOf(":");
        if (separator <= 0 || /^[ \t]/.test(line)) {
            throw new HttpError(400, "invalid multipart headers");
        }
        const name = line.slice(0, separator).trim().toLowerCase();
        const content = line.slice(separator + 1).trim();
        if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name) || headers.has(name)) {
            throw new HttpError(400, "invalid multipart headers");
        }
        headers.set(name, content);
    }
    return headers;
}

function contentDisposition(value: string | undefined): { filename: string | null; name: string | null } {
    if (!value || !/^form-data(?:;|$)/i.test(value.trim())) {
        throw new HttpError(400, "invalid multipart disposition");
    }
    return {
        filename: dispositionParameter(value, "filename"),
        name: dispositionParameter(value, "name"),
    };
}

function dispositionParameter(value: string, name: string): string | null {
    const expression = new RegExp(`(?:^|;)\\s*${name}=(?:"((?:[^"\\\\]|\\\\.)*)"|([^;]*))`, "i");
    const match = expression.exec(value);
    if (!match) {
        return null;
    }
    const raw = match[1] === undefined ? (match[2] ?? "").trim() : match[1].replace(/\\(.)/g, "$1");
    if (/[\r\n\x00]/.test(raw)) {
        throw new HttpError(400, "invalid multipart disposition");
    }
    return raw;
}

function safeFilename(value: string): string {
    const filename = value.split(/[\\/]/).at(-1)?.trim() ?? "";
    return filename || "image";
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
