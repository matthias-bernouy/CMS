import { decodeUtf8, detectMediaSignature, isSvgLike } from "./signatures";

export { detectMediaSignature, type DetectedMedia } from "./signatures";

const BINARY_MEDIA = new Set([
    "application/gzip",
    "application/mp4",
    "application/pdf",
    "application/zip",
    "audio/mp4",
    "audio/mpeg",
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

export function mediaTypeIssue(mediaType: string, bytes: Uint8Array): string | null {
    if (mediaType === "application/octet-stream") {
        return null;
    }
    const detected = detectMediaSignature(bytes);
    if (detected && !detected.acceptedMediaTypes.includes(mediaType)) {
        return `declared media type ${mediaType} does not match recognized ${detected.label}`;
    }
    if (BINARY_MEDIA.has(mediaType) && !detected?.acceptedMediaTypes.includes(mediaType)) {
        return `binary signature does not match declared media type ${mediaType}`;
    }
    if (mediaType === "image/svg+xml") {
        return isSvgLike(bytes) ? null : "asset bytes are not a recognizable UTF-8 SVG document";
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
