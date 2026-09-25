import { ReleaseValidationError } from "../../core/protocol/errors";
import { expectRecord, expectString, rejectUnknownKeys } from "../../core/protocol/values";
import { matchesStringFormat } from "../../core/schema/formats";
import { parseSemVer } from "../../core/parsing/identifiers";
import type { ContractReleaseDeprecation, ContractReleaseYank } from "../../interfaces/ReleaseCatalogue";

export function normalizeReleaseDeprecation(
    value: ContractReleaseDeprecation,
    contractId: string,
    version: string,
    hasRelease: (contractId: string, version: string) => boolean,
): ContractReleaseDeprecation {
    const record = expectRecord(value, "$.deprecation", "invalid_contract");
    rejectUnknownKeys(record, ["reason", "replacedByVersion", "sunsetAt"], "$.deprecation", "invalid_contract");
    const reason = optionalReason(record.reason, "$.deprecation.reason");
    const replacedByVersion =
        record.replacedByVersion === undefined
            ? undefined
            : parseSemVer(record.replacedByVersion, "$.deprecation.replacedByVersion");
    const sunsetAt =
        record.sunsetAt === undefined
            ? undefined
            : expectString(record.sunsetAt, "$.deprecation.sunsetAt", "invalid_contract", 128);
    if (sunsetAt && !matchesStringFormat(sunsetAt, "date-time")) {
        throw new ReleaseValidationError("invalid_contract", "must be a valid date-time", "$.deprecation.sunsetAt");
    }
    if (replacedByVersion && (replacedByVersion === version || !hasRelease(contractId, replacedByVersion))) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "replacement must identify another published version",
            "$.deprecation.replacedByVersion",
        );
    }
    if (!reason && !replacedByVersion && !sunsetAt) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "must include reason, replacedByVersion, or sunsetAt",
            "$.deprecation",
        );
    }
    return {
        ...(reason ? { reason } : {}),
        ...(replacedByVersion ? { replacedByVersion } : {}),
        ...(sunsetAt ? { sunsetAt } : {}),
    };
}

export function normalizeReleaseYank(value: ContractReleaseYank): ContractReleaseYank {
    const record = expectRecord(value, "$.yank", "invalid_contract");
    rejectUnknownKeys(record, ["reason"], "$.yank", "invalid_contract");
    return { reason: requiredReason(record.reason, "$.yank.reason") };
}

function optionalReason(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : requiredReason(value, path);
}

function requiredReason(value: unknown, path: string): string {
    const reason = expectString(value, path, "invalid_contract", 1024);
    if (reason.trim().length === 0) {
        throw new ReleaseValidationError("invalid_contract", "must not be blank", path);
    }
    return reason;
}
