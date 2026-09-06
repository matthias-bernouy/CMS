import type { PresentationImage } from "cms-content/interfaces/blocs";
import { ContentValidationError } from "cms-content/core/validation/errors";

const MIME_TYPES: Record<string, string> = {
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
};

export function presentationImageContentType(path: string): string | null {
    if (
        !path.startsWith("assets/") ||
        /[\\%?#\x00-\x20]/.test(path) ||
        path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
        return null;
    }
    return MIME_TYPES[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? null;
}

export function parsePresentationImage(value: unknown, field = "thumbnail"): PresentationImage | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentValidationError(field, "image reference object expected");
    }
    const image = value as Record<string, unknown>;
    if (typeof image.path !== "string" || !presentationImageContentType(image.path)) {
        throw new ContentValidationError(`${field}.path`, "expected a PNG, JPEG, WebP or SVG file inside assets/");
    }
    if (image.alt !== undefined && typeof image.alt !== "string") {
        throw new ContentValidationError(`${field}.alt`, "text expected");
    }
    return { path: image.path, ...(typeof image.alt === "string" ? { alt: image.alt } : {}) };
}

export function blocThumbnailFromSource(source: Record<string, string> | undefined): PresentationImage | undefined {
    const encoded = source?.["manifest.json"] ?? source?.["./manifest.json"];
    if (!encoded) {
        return undefined;
    }
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsePresentationImage(manifest?.thumbnail, "manifest.thumbnail");
}

/** Reject extension/MIME confusion before serving an image as an inline asset. */
export function isPresentationImageBytes(bytes: Uint8Array, contentType: string): boolean {
    const type = contentType.split(";")[0]?.trim().toLowerCase();
    const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
    if (type === "image/png") {
        return starts([137, 80, 78, 71, 13, 10, 26, 10]);
    }
    if (type === "image/jpeg") {
        return starts([255, 216, 255]);
    }
    if (type === "image/webp") {
        return starts([82, 73, 70, 70]) && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
    }
    if (type === "image/svg+xml") {
        try {
            return /^<svg(?:\s|>)/i.test(
                new TextDecoder("utf-8", { fatal: true })
                    .decode(bytes)
                    .trimStart()
                    .replace(/^<\?xml[^>]*>\s*/i, ""),
            );
        } catch {
            return false;
        }
    }
    return false;
}
