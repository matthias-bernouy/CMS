import { parse } from "semver";
import { assertIJsonValue, InvalidIJsonValueError } from "../canonical/assertIJson";
import type { IntegrationPackageFileV1 } from "../../interfaces/envelope";
import { assertCanonicalBase64 } from "./encoding";
import { IntegrationPackageValidationError } from "./errors";

const ENVELOPE_FIELDS = new Set(["schema", "kind", "version", "definition", "releaseNotes", "files"]);
const FILE_FIELDS = new Set(["encoding", "content"]);

export function assertEnvelopeIJson(input: unknown): void {
    try {
        assertIJsonValue(input);
    } catch (error) {
        if (error instanceof InvalidIJsonValueError) {
            throw new IntegrationPackageValidationError("invalid_unicode", error.message);
        }
        throw error;
    }
}

export function parseEnvelopeRecord(input: unknown): Record<string, unknown> {
    return strictRecord(input, "$", ENVELOPE_FIELDS);
}

export function parseIntegrationPackageFile(input: unknown, field: string): IntegrationPackageFileV1 {
    const value = strictRecord(input, field, FILE_FIELDS);
    const encoding = requiredStringField(value, "encoding", field);
    if (encoding !== "utf8" && encoding !== "base64") {
        throw new IntegrationPackageValidationError(
            "invalid_encoding",
            `${field}.encoding must be utf8 or base64`,
            `${field}.encoding`,
        );
    }
    const content = requiredStringField(value, "content", field, true);
    if (encoding === "base64") {
        assertCanonicalBase64(content, `${field}.content`);
    }
    return { encoding, content };
}

export function assertReferencedUtf8File(
    files: Record<string, IntegrationPackageFileV1>,
    path: string,
    field: "definition" | "releaseNotes",
): void {
    const file = files[path];
    if (!file) {
        throw new IntegrationPackageValidationError(
            "missing_file",
            `${field} does not reference a package file`,
            field,
        );
    }
    if (file.encoding !== "utf8") {
        throw new IntegrationPackageValidationError("invalid_encoding", `${field} must reference a UTF-8 file`, field);
    }
}

export function exactPackageVersion(value: string): string {
    const parsed = parse(value);
    const canonical = parsed
        ? `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`
        : undefined;
    if (!parsed || canonical !== value) {
        throw new IntegrationPackageValidationError(
            "invalid_version",
            "version must be an exact SemVer 2.0 version",
            "version",
        );
    }
    return value;
}

export function packageKind(value: Record<string, unknown>): string {
    const result = requiredStringField(value, "kind");
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(result)) {
        throw new IntegrationPackageValidationError(
            "invalid_envelope",
            "kind must be a non-empty path-safe identifier",
            "kind",
        );
    }
    return result;
}

export function requiredStringField(
    value: Record<string, unknown>,
    field: string,
    parent = "$",
    allowEmpty = false,
): string {
    return requiredString(value[field], `${parent}.${field}`, allowEmpty);
}

export function requiredString(value: unknown, field: string, allowEmpty = false): string {
    if (typeof value !== "string" || (!allowEmpty && !value)) {
        throw new IntegrationPackageValidationError("invalid_envelope", `${field} must be a string`, field);
    }
    return value;
}

export function strictRecord(
    value: unknown,
    field: string,
    allowedFields?: ReadonlySet<string>,
): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new IntegrationPackageValidationError("invalid_envelope", `${field} must be an object`, field);
    }
    const result = value as Record<string, unknown>;
    if (allowedFields) {
        const unknownField = Object.keys(result).find((key) => !allowedFields.has(key));
        if (unknownField) {
            throw new IntegrationPackageValidationError(
                "invalid_envelope",
                `${field} contains unknown field ${JSON.stringify(unknownField)}`,
                `${field}.${unknownField}`,
            );
        }
    }
    return result;
}
