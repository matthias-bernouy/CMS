type DetectedMedia = { label: string; accepted: readonly string[] };

const BINARY_MEDIA = new Set([
    "application/gzip",
    "application/mp4",
    "application/pdf",
    "application/zip",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "font/otf",
    "font/ttf",
    "font/woff",
    "font/woff2",
    "image/avif",
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/vnd.microsoft.icon",
    "image/webp",
    "image/x-icon",
    "video/mp4",
    "video/webm",
]);

export function collectionAssetMediaTypeIssue(mediaType: string, bytes: Uint8Array): string | null {
    const detected = detectMedia(bytes);
    if (detected && !detected.accepted.includes(mediaType)) {
        return `declared media type ${mediaType} does not match detected ${detected.label}`;
    }
    if (BINARY_MEDIA.has(mediaType) && !detected?.accepted.includes(mediaType)) {
        return `asset bytes do not match declared media type ${mediaType}`;
    }
    if (mediaType === "image/svg+xml") {
        return isSvg(bytes) ? null : "asset bytes are not a valid UTF-8 SVG document";
    }
    if (isUtf8MediaType(mediaType)) {
        const text = decodeUtf8(bytes);
        if (text === null) {
            return `asset bytes are not valid UTF-8 for ${mediaType}`;
        }
        if (mediaType === "application/json") {
            try {
                JSON.parse(text);
            } catch {
                return "asset bytes are not valid JSON";
            }
        }
    }
    return null;
}

function detectMedia(bytes: Uint8Array): DetectedMedia | null {
    if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return exact("image/png");
    }
    if (starts(bytes, [0xff, 0xd8, 0xff])) {
        return exact("image/jpeg");
    }
    const header = ascii(bytes, 0, 12);
    if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
        return exact("image/gif");
    }
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") {
        return exact("image/webp");
    }
    if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE") {
        return exact("audio/wav");
    }
    if (starts(bytes, [0x42, 0x4d])) {
        return exact("image/bmp");
    }
    if (starts(bytes, [0x00, 0x00, 0x01, 0x00])) {
        return { label: "image/x-icon", accepted: ["image/x-icon", "image/vnd.microsoft.icon"] };
    }
    if (header.startsWith("%PDF-")) {
        return exact("application/pdf");
    }
    if (header.startsWith("wOFF")) {
        return exact("font/woff");
    }
    if (header.startsWith("wOF2")) {
        return exact("font/woff2");
    }
    if (header.startsWith("OTTO")) {
        return exact("font/otf");
    }
    if (starts(bytes, [0x00, 0x01, 0x00, 0x00]) || header.startsWith("true")) {
        return exact("font/ttf");
    }
    if (header.startsWith("OggS")) {
        return exact("audio/ogg");
    }
    if (header.startsWith("ID3") || (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)) {
        return exact("audio/mpeg");
    }
    if (starts(bytes, [0x1f, 0x8b])) {
        return exact("application/gzip");
    }
    if (
        starts(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
        starts(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
        starts(bytes, [0x50, 0x4b, 0x07, 0x08])
    ) {
        return exact("application/zip");
    }
    if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
        return { label: "WebM", accepted: ["audio/webm", "video/webm"] };
    }
    if (ascii(bytes, 4, 4) === "ftyp") {
        const brands = ascii(bytes, 8, Math.min(32, Math.max(0, bytes.length - 8)));
        if (brands.includes("avif") || brands.includes("avis")) {
            return exact("image/avif");
        }
        return { label: "ISO base media", accepted: ["application/mp4", "audio/mp4", "video/mp4"] };
    }
    if (isSvg(bytes)) {
        return exact("image/svg+xml");
    }
    return null;
}

function exact(mediaType: string): DetectedMedia {
    return { label: mediaType, accepted: [mediaType] };
}

function starts(bytes: Uint8Array, prefix: readonly number[]): boolean {
    return prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function decodeUtf8(bytes: Uint8Array): string | null {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

function isSvg(bytes: Uint8Array): boolean {
    const text = decodeUtf8(bytes);
    return Boolean(
        text?.match(
            /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE\s+svg[^>]*>\s*)?<svg(?:\s|>)/iu,
        ),
    );
}

function isUtf8MediaType(mediaType: string): boolean {
    return (
        mediaType.startsWith("text/") ||
        mediaType === "application/json" ||
        mediaType === "application/javascript" ||
        mediaType === "application/xml" ||
        mediaType.endsWith("+json") ||
        mediaType.endsWith("+xml")
    );
}
