import { ReleaseValidationError } from "@bernouy/cms-contracts";
import { canonicalIJsonBytes, deepFreeze, parseStrictJson } from "@bernouy/cms-contracts/protocol";
import { ProviderManifestValidationError } from "cms-providers/manifests/core/errors";
import { expectRecord, type UnknownRecord } from "cms-providers/manifests/core/values";
import { ProviderInstallationValidationError, type ProviderInstallationValidationCode } from "../errors";
import type { ProviderInstallationLimits } from "../limits";

export function parseInstallationDocument<T>(
    value: unknown,
    limits: Readonly<ProviderInstallationLimits>,
    parseRecord: (record: UnknownRecord) => T,
): T {
    validateLimits(limits);
    try {
        if (canonicalIJsonBytes(value, limits.maxJsonDepth).byteLength > limits.maxDocumentBytes) {
            throw new ProviderInstallationValidationError("body_limit_exceeded", "document exceeds byte limit");
        }
        // Configuration and report literals must not retain or freeze caller-owned objects.
        return deepFreeze(parseRecord(expectRecord(structuredClone(value), "$"))) as T;
    } catch (error) {
        return translateError(error);
    }
}

export function parseInstallationJson<T>(
    input: string | Uint8Array,
    limits: Readonly<ProviderInstallationLimits>,
    parseValue: (value: unknown) => T,
): T {
    validateLimits(limits);
    try {
        return parseValue(parseStrictJson(input, limits.maxDocumentBytes, limits.maxJsonDepth));
    } catch (error) {
        return translateError(error);
    }
}

function validateLimits(limits: Readonly<ProviderInstallationLimits>): void {
    for (const value of [limits.maxDocumentBytes, limits.maxJsonDepth, limits.maxImplementations]) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError("Provider installation limits must be positive safe integers");
        }
    }
}

function translateError(error: unknown): never {
    if (!(error instanceof ReleaseValidationError) && !(error instanceof ProviderManifestValidationError)) {
        throw error;
    }
    const codes = new Set([
        "body_limit_exceeded",
        "duplicate_json_property",
        "invalid_json",
        "invalid_utf8",
        "json_depth_limit_exceeded",
    ]);
    const code = codes.has(error.code) ? (error.code as ProviderInstallationValidationCode) : "invalid_installation";
    const prefix = `${error.path}: `;
    const message = error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message;
    throw new ProviderInstallationValidationError(code, message, error.path);
}
