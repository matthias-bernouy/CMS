import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { integrationVersionSatisfies, isSupportedIntegrationVersionRange } from "@bernouy/cms-integrations";
import { IntegrationVerificationContractError, wrapPackageValidation } from "./errors";
import { invalid, strictRecord } from "./structure";

const utf8 = new TextEncoder();
const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const STABLE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export function requiredText(value: unknown, field: string, maximumBytes = 16_384): string {
    if (typeof value !== "string" || value.length === 0) {
        throw invalid(field, "must be a non-empty string");
    }
    if (utf8.encode(value).byteLength > maximumBytes) {
        throw new IntegrationVerificationContractError(
            "limit_exceeded",
            `${field} must not exceed ${maximumBytes} UTF-8 bytes`,
            field,
        );
    }
    return value;
}

export function stableIdentifier(value: unknown, field: string): string {
    const parsed = requiredText(value, field, 256);
    if (!STABLE_IDENTIFIER.test(parsed)) {
        throw invalid(field, "must be a stable identifier");
    }
    return parsed;
}

export function packageKind(value: unknown, field: string): string {
    return wrapPackageValidation(() => assertIntegrationPackageKind(value));
}

export function exactVersion(value: unknown, field: string): string {
    if (typeof value !== "string") {
        throw invalid(field, "must be an exact SemVer version");
    }
    return wrapPackageValidation(() => assertIntegrationPackageVersion(value));
}

export function supportedVersionRange(value: unknown, field: string): string {
    const parsed = requiredText(value, field, 256);
    if (!isSupportedIntegrationVersionRange(parsed)) {
        throw invalid(field, "must be an exact, caret, tilde, or bounded SemVer range");
    }
    return parsed;
}

export function assertVersionInRange(version: string, range: string, field: string): void {
    if (!integrationVersionSatisfies(version, range)) {
        throw invalid(field, `does not include version ${version}`);
    }
}

export function sha256Digest(value: unknown, field: string): string {
    const parsed = requiredText(value, field, 64);
    if (!SHA256.test(parsed)) {
        throw new IntegrationVerificationContractError(
            "invalid_digest",
            `${field} must be a lowercase SHA-256 digest`,
            field,
        );
    }
    return parsed;
}

export function imageDigest(value: unknown, field: string): string {
    const parsed = requiredText(value, field, 71);
    if (!IMAGE_DIGEST.test(parsed)) {
        throw new IntegrationVerificationContractError(
            "invalid_digest",
            `${field} must be a pinned sha256 image digest`,
            field,
        );
    }
    return parsed;
}

export function timestamp(value: unknown, field: string): string {
    const parsed = requiredText(value, field, 64);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
        throw invalid(field, "must be an RFC 3339 UTC timestamp");
    }
    return parsed;
}

export function requiredBoolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
        throw invalid(field, "must be a boolean");
    }
    return value;
}

export function nonNegativeInteger(value: unknown, field: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw invalid(field, "must be a non-negative safe integer");
    }
    return value as number;
}

export function positiveInteger(value: unknown, field: string): number {
    const parsed = nonNegativeInteger(value, field);
    if (parsed === 0) {
        throw invalid(field, "must be positive");
    }
    return parsed;
}

export function oneOf<const T extends readonly string[]>(value: unknown, field: string, allowed: T): T[number] {
    const parsed = requiredText(value, field, 128);
    if (!allowed.includes(parsed)) {
        throw invalid(field, `must be one of ${allowed.join(", ")}`);
    }
    return parsed as T[number];
}

export function optionalText(value: unknown, field: string, maximumBytes = 16_384): string | undefined {
    return value === undefined ? undefined : requiredText(value, field, maximumBytes);
}

export function versionedIdentity(value: unknown, field: string): Readonly<{ name: string; version: string }> {
    const record = strictRecord(value, field, ["name", "version"]);
    return {
        name: stableIdentifier(record.name, `${field}.name`),
        version: exactVersion(record.version, `${field}.version`),
    };
}
