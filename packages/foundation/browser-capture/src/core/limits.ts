import type { CaptureDocument, CaptureOptions } from "../interfaces/CaptureEngine";
export const CAPTURE_LIMITS = Object.freeze({
    timeoutMs: 20_000,
    concurrent: 2,
    files: 2048,
    inputBytes: 64 * 1024 * 1024,
    imageBytes: 4 * 1024 * 1024,
    pixels: 12_000_000,
    dimension: 4096,
    fullHeight: 16384,
});
export class CaptureError extends Error {
    constructor(readonly code: "INVALID_INPUT" | "UNAVAILABLE" | "BUSY" | "FAILED" | "LIMIT_EXCEEDED") {
        super(code);
    }
}
export function validateCaptureOptions(options: CaptureOptions): void {
    if (
        !Number.isInteger(options.width) ||
        !Number.isInteger(options.height) ||
        options.width < 1 ||
        options.width > CAPTURE_LIMITS.dimension ||
        options.height < 1 ||
        options.height > CAPTURE_LIMITS.dimension ||
        options.width * options.height > CAPTURE_LIMITS.pixels ||
        !["viewport", "full-page", "element"].includes(options.mode) ||
        !["light", "dark"].includes(options.themeMode) ||
        (options.mode === "element"
            ? typeof options.selector !== "string" || !options.selector || options.selector.length > 512
            : options.selector !== undefined)
    ) {
        throw new CaptureError("INVALID_INPUT");
    }
}
export function validateCapture(document: CaptureDocument, options: CaptureOptions): void {
    validateCaptureOptions(options);
    if (document.origin !== undefined) {
        if (document.origin.length > 2048) {
            throw new CaptureError("INVALID_INPUT");
        }
        try {
            const origin = new URL(document.origin);
            if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== document.origin) {
                throw new Error("Invalid origin");
            }
        } catch {
            throw new CaptureError("INVALID_INPUT");
        }
    }
    let bytes = 0;
    let entry: string;
    try {
        const query = document.path.indexOf("?");
        entry =
            query < 0
                ? decodeURIComponent(document.path)
                : decodeURIComponent(document.path.slice(0, query)) + document.path.slice(query);
    } catch {
        throw new CaptureError("INVALID_INPUT");
    }
    if (!document.files.has(entry) || document.files.size > CAPTURE_LIMITS.files) {
        throw new CaptureError("INVALID_INPUT");
    }
    for (const [path, file] of document.files) {
        const pathname = path.split("?")[0]!;
        if (
            pathname !== "" &&
            (pathname.startsWith("/") ||
                pathname.includes("\\") ||
                pathname.split("/").some((part) => !part || part === "." || part === ".."))
        ) {
            throw new CaptureError("INVALID_INPUT");
        }
        bytes += file.size;
    }
    if (bytes > CAPTURE_LIMITS.inputBytes) {
        throw new CaptureError("LIMIT_EXCEEDED");
    }
}
