import type { FileType } from "@bernouy/core";

/**
 * Coarse categorization for the discriminant of `FileMetadata`. Anything not
 * matched by the explicit branches falls back to "other".
 */
export function mimeToFileType(mimeType: string): FileType {
    const t = mimeType.toLowerCase();
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (t === "application/pdf") return "pdf";
    if (t.startsWith("text/")) return "text";
    if (/zip|tar|gzip|x-7z|x-rar|x-bzip/i.test(t)) return "archive";
    if (t.startsWith("application/")) return "document";
    return "other";
}
