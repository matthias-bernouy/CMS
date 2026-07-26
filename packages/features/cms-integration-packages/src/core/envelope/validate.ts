import {
    INTEGRATION_PACKAGE_SCHEMA,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageValidationOptions,
} from "../../interfaces/envelope";
import { canonicalJsonBytes } from "../canonical/canonicalizeJson";
import { validateCanonicalFileSet } from "../file-set/validate";
import { resolveIntegrationPackageLimits } from "./constants";
import { IntegrationPackageValidationError } from "./errors";
import {
    assertEnvelopeIJson,
    assertReferencedUtf8File,
    exactPackageVersion,
    packageKind,
    parseEnvelopeRecord,
    requiredString,
    requiredStringField,
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

    const parsedFiles = validateCanonicalFileSet(envelope.files, { limits });
    assertReferencedUtf8File(parsedFiles, definition, "definition");
    if (releaseNotes) {
        assertReferencedUtf8File(parsedFiles, releaseNotes, "releaseNotes");
    }
    const result: IntegrationPackageEnvelopeV1 = {
        schema: INTEGRATION_PACKAGE_SCHEMA,
        kind,
        version,
        definition,
        ...(releaseNotes ? { releaseNotes } : {}),
        files: parsedFiles,
    };
    if (canonicalJsonBytes(result).byteLength > limits.maxDocumentBytes) {
        throw new IntegrationPackageValidationError(
            "body_limit_exceeded",
            `canonical JSON document exceeds ${limits.maxDocumentBytes} bytes`,
        );
    }
    return result;
}
