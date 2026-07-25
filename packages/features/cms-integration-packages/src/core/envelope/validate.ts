import {
    INTEGRATION_PACKAGE_SCHEMA,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageFileV1,
    type IntegrationPackageValidationOptions,
} from "../../interfaces/envelope";
import { resolveIntegrationPackageLimits } from "./constants";
import { decodedIntegrationPackageFileByteLength } from "./encoding";
import { IntegrationPackageValidationError } from "./errors";
import {
    assertEnvelopeIJson,
    assertReferencedUtf8File,
    exactPackageVersion,
    packageKind,
    parseEnvelopeRecord,
    parseIntegrationPackageFile,
    requiredString,
    requiredStringField,
    strictRecord,
} from "./fields";
import { assertIntegrationPackagePath } from "./path";
import { parseStrictPackageJson } from "./strictJson";

export function parseIntegrationPackageEnvelope(
    input: string | Uint8Array,
    options: IntegrationPackageValidationOptions = {},
): IntegrationPackageEnvelopeV1 {
    const limits = resolveIntegrationPackageLimits(options.limits);
    return validateIntegrationPackageEnvelope(parseStrictPackageJson(input, limits), { ...options, limits });
}

export function validateIntegrationPackageEnvelope(
    input: unknown,
    options: IntegrationPackageValidationOptions = {},
): IntegrationPackageEnvelopeV1 {
    const limits = resolveIntegrationPackageLimits(options.limits);
    assertEnvelopeIJson(input);
    const envelope = parseEnvelopeRecord(input);
    const schema = requiredStringField(envelope, "schema");
    if (schema !== INTEGRATION_PACKAGE_SCHEMA) {
        throw new IntegrationPackageValidationError(
            "invalid_schema",
            `schema must be ${JSON.stringify(INTEGRATION_PACKAGE_SCHEMA)}`,
            "schema",
        );
    }
    const kind = packageKind(envelope);
    const version = exactPackageVersion(requiredStringField(envelope, "version"));
    const definition = assertIntegrationPackagePath(requiredStringField(envelope, "definition"), limits);
    const releaseNotesValue = envelope.releaseNotes;
    const releaseNotes =
        releaseNotesValue === undefined
            ? undefined
            : assertIntegrationPackagePath(requiredString(releaseNotesValue, "releaseNotes"), limits);
    if (options.requireReleaseNotes && !releaseNotes) {
        throw new IntegrationPackageValidationError(
            "missing_file",
            "releaseNotes is required for a managed publication",
            "releaseNotes",
        );
    }
    if (releaseNotes === definition) {
        throw new IntegrationPackageValidationError(
            "invalid_envelope",
            "definition and releaseNotes must reference different files",
            "releaseNotes",
        );
    }

    const fileValues = strictRecord(envelope.files, "files");
    const entries = Object.entries(fileValues);
    if (entries.length > limits.maxFiles) {
        throw new IntegrationPackageValidationError(
            "file_limit_exceeded",
            `files contains more than ${limits.maxFiles} entries`,
            "files",
        );
    }
    let decodedBytes = 0;
    const files: Array<[string, IntegrationPackageFileV1]> = [];
    const canonicalPaths = new Set<string>();
    for (const [path, value] of entries) {
        const canonicalPath = assertIntegrationPackagePath(path, limits);
        if (canonicalPaths.has(canonicalPath)) {
            throw new IntegrationPackageValidationError(
                "invalid_path",
                `duplicate normalized file path ${JSON.stringify(canonicalPath)}`,
                canonicalPath,
            );
        }
        canonicalPaths.add(canonicalPath);
        const file = parseIntegrationPackageFile(value, `files.${path}`);
        const fileBytes = decodedIntegrationPackageFileByteLength(file);
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

    const parsedFiles = Object.fromEntries(files);
    assertReferencedUtf8File(parsedFiles, definition, "definition");
    if (releaseNotes) {
        assertReferencedUtf8File(parsedFiles, releaseNotes, "releaseNotes");
    }
    return {
        schema: INTEGRATION_PACKAGE_SCHEMA,
        kind,
        version,
        definition,
        ...(releaseNotes ? { releaseNotes } : {}),
        files: parsedFiles,
    };
}
