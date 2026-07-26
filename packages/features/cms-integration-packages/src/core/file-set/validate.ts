import { canonicalJsonBytes } from "../canonical/canonicalizeJson";
import { resolveCanonicalFileSetLimits } from "../envelope/constants";
import { decodedCanonicalFileByteLength } from "../envelope/encoding";
import { IntegrationPackageValidationError } from "../envelope/errors";
import { assertEnvelopeIJson, parseIntegrationPackageFile, strictRecord } from "../envelope/fields";
import { assertCanonicalFileLayout, assertCanonicalFilePath } from "../envelope/path";
import type {
    CanonicalFile,
    CanonicalFileSet,
    CanonicalFileSetLimits,
    CanonicalFileSetValidationOptions,
} from "../../interfaces/fileSet";

export function validateCanonicalFileSet(
    input: unknown,
    options: CanonicalFileSetValidationOptions = {},
): CanonicalFileSet {
    const limits = resolveCanonicalFileSetLimits(options.limits);
    assertEnvelopeIJson(input);
    const values = strictRecord(input, "files");
    const entries = Object.entries(values);
    if (entries.length > limits.maxFiles) {
        throw new IntegrationPackageValidationError(
            "file_limit_exceeded",
            `files contains more than ${limits.maxFiles} entries`,
            "files",
        );
    }

    return validateEntries(entries, limits);
}

export function canonicalFileSetBytes(input: unknown, options: CanonicalFileSetValidationOptions = {}): Uint8Array {
    const limits = resolveCanonicalFileSetLimits(options.limits);
    const bytes = canonicalJsonBytes(validateCanonicalFileSet(input, { limits }));
    if (bytes.byteLength > limits.maxDocumentBytes) {
        throw new IntegrationPackageValidationError(
            "body_limit_exceeded",
            `canonical file-set exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    return bytes;
}

function validateEntries(
    entries: ReadonlyArray<readonly [string, unknown]>,
    limits: Readonly<CanonicalFileSetLimits>,
): CanonicalFileSet {
    let decodedBytes = 0;
    const files: Array<[string, CanonicalFile]> = [];
    const canonicalPaths = new Set<string>();
    const directoryPaths = new Set<string>();
    for (const [path, value] of entries) {
        const canonicalPath = assertCanonicalFilePath(path, limits);
        if (canonicalPaths.has(canonicalPath)) {
            throw new IntegrationPackageValidationError(
                "invalid_path",
                `duplicate normalized file path ${JSON.stringify(canonicalPath)}`,
                canonicalPath,
            );
        }
        assertCanonicalFileLayout(canonicalPath, canonicalPaths, directoryPaths, limits.maxDirectories);
        canonicalPaths.add(canonicalPath);
        const file = parseIntegrationPackageFile(value, `files.${path}`);
        const fileBytes = decodedCanonicalFileByteLength(file);
        if (fileBytes > limits.maxFileBytes) {
            throw new IntegrationPackageValidationError(
                "decoded_bytes_limit_exceeded",
                `${canonicalPath} exceeds ${limits.maxFileBytes} decoded bytes`,
                canonicalPath,
            );
        }
        decodedBytes += fileBytes;
        if (decodedBytes > limits.maxDecodedBytes) {
            throw new IntegrationPackageValidationError(
                "decoded_bytes_limit_exceeded",
                `decoded files exceed ${limits.maxDecodedBytes} bytes`,
                "files",
            );
        }
        files.push([canonicalPath, file]);
    }
    return Object.fromEntries(files);
}
