import { gzipSync } from "node:zlib";

type BrowserBuildMetafile = {
    inputs: Record<string, unknown>;
};

const FORBIDDEN_SOURCE_SEGMENTS = [
    "/application/",
    "/default-implementation/",
    "/http/",
    "/mongo/",
    "/pages/",
    "/runtime-assets/",
    "/settings/",
    "/blocs/core/validation/",
    "/blocs/core/markup/validation/",
] as const;

export const CONTENT_BROWSER_BUNDLE_LIMITS = {
    "binding-core.js": { rawBytes: 80_000, gzipBytes: 25_000 },
    "bloc-runtime.js": { rawBytes: 5_000, gzipBytes: 2_500 },
} as const;

export function assertBrowserBuildGraph(output: string, metafile: BrowserBuildMetafile): void {
    const forbiddenInputs = Object.keys(metafile.inputs)
        .map((input) => input.replaceAll("\\", "/"))
        .filter((input) => FORBIDDEN_SOURCE_SEGMENTS.some((segment) => input.includes(segment)));
    if (forbiddenInputs.length > 0) {
        throw new Error(`${output} includes server-only source:\n${forbiddenInputs.join("\n")}`);
    }
}

export function assertBrowserBundleSize(output: keyof typeof CONTENT_BROWSER_BUNDLE_LIMITS, bytes: Uint8Array): void {
    const limits = CONTENT_BROWSER_BUNDLE_LIMITS[output];
    const gzipBytes = gzipSync(bytes).byteLength;
    if (bytes.byteLength > limits.rawBytes || gzipBytes > limits.gzipBytes) {
        throw new Error(
            `${output} exceeds its browser budget: ${bytes.byteLength}/${limits.rawBytes} raw bytes, ` +
                `${gzipBytes}/${limits.gzipBytes} gzip bytes`,
        );
    }
}
