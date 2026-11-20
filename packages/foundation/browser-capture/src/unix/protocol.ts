import type { CaptureDocument, CaptureOptions, CaptureResult } from "../interfaces/CaptureEngine";
import { CAPTURE_LIMITS, CaptureError, validateCapture, validateCaptureOptions } from "../core/limits";

export async function encodeDocument(document: CaptureDocument, options: CaptureOptions) {
    validateCapture(document, options);
    return {
        origin: document.origin ?? "https://capture.invalid",
        path: document.path,
        options,
        files: await Promise.all(
            [...document.files].map(async ([path, blob]) => ({
                path,
                mediaType: blob.type,
                base64: Buffer.from(await blob.arrayBuffer()).toString("base64"),
            })),
        ),
    };
}
function record(value: unknown): Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new CaptureError("INVALID_INPUT");
    }
    return value;
}
export function decodeDocument(value: unknown): { document: CaptureDocument; options: CaptureOptions } {
    const job = record(value);
    if (
        Object.keys(job).sort().join(",") !== "files,options,origin,path" ||
        typeof job.origin !== "string" ||
        typeof job.path !== "string" ||
        !Array.isArray(job.files) ||
        job.files.length > CAPTURE_LIMITS.files
    ) {
        throw new CaptureError("INVALID_INPUT");
    }
    const options = record(job.options) as CaptureOptions;
    if (Object.keys(options).some((key) => !["width", "height", "mode", "themeMode", "selector"].includes(key))) {
        throw new CaptureError("INVALID_INPUT");
    }
    validateCaptureOptions(options);
    const files = new Map<string, Blob>();
    let total = 0;
    for (const input of job.files) {
        const file = record(input);
        if (
            Object.keys(file).sort().join(",") !== "base64,mediaType,path" ||
            typeof file.path !== "string" ||
            file.path.length > 2048 ||
            files.has(file.path) ||
            typeof file.mediaType !== "string" ||
            file.mediaType.length > 256 ||
            typeof file.base64 !== "string" ||
            file.base64.length > Math.ceil(CAPTURE_LIMITS.inputBytes / 3) * 4
        ) {
            throw new CaptureError("INVALID_INPUT");
        }
        const bytes = Buffer.from(file.base64, "base64");
        total += bytes.byteLength;
        if (total > CAPTURE_LIMITS.inputBytes) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        if (bytes.toString("base64") !== file.base64) {
            throw new CaptureError("INVALID_INPUT");
        }
        files.set(file.path, new Blob([bytes], { type: file.mediaType }));
    }
    const document = { path: job.path, files, origin: job.origin };
    validateCapture(document, options);
    return { document, options };
}
export function decodeResult(value: unknown): CaptureResult {
    const result = record(value);
    if (
        typeof result.base64 !== "string" ||
        result.base64.length > Math.ceil(CAPTURE_LIMITS.imageBytes / 3) * 4 ||
        typeof result.browserVersion !== "string" ||
        result.browserVersion.length > 256 ||
        !Array.isArray(result.diagnostics) ||
        result.diagnostics.length > 32 ||
        result.diagnostics.some((item: unknown) => typeof item !== "string" || item.length > 512)
    ) {
        throw new CaptureError("FAILED");
    }
    const bytes = Buffer.from(result.base64, "base64");
    if (
        bytes.byteLength < 24 ||
        bytes.byteLength > CAPTURE_LIMITS.imageBytes ||
        !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.toString("base64") !== result.base64 ||
        result.width !== bytes.readUInt32BE(16) ||
        result.height !== bytes.readUInt32BE(20) ||
        result.width < 1 ||
        result.width > CAPTURE_LIMITS.dimension ||
        result.height < 1 ||
        result.height > CAPTURE_LIMITS.fullHeight ||
        result.width * result.height > CAPTURE_LIMITS.pixels
    ) {
        throw new CaptureError("FAILED");
    }
    return {
        bytes,
        width: result.width,
        height: result.height,
        browserVersion: result.browserVersion,
        diagnostics: result.diagnostics,
    };
}
