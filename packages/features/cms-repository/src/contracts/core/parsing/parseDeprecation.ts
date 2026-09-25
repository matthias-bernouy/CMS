import { ReleaseValidationError } from "../protocol/errors";
import { expectRecord, expectString, rejectUnknownKeys } from "../protocol/values";
import type { CapabilityDeprecation } from "../../interfaces/ContractRelease";
import { matchesStringFormat } from "../schema/formats";
import { parseIdentifier } from "./identifiers";

export function parseCapabilityDeprecation(value: unknown, path: string): CapabilityDeprecation {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["reason", "replacedBy", "sunsetAt"], path, "invalid_contract");
    const reason =
        record.reason === undefined
            ? undefined
            : expectString(record.reason, `${path}.reason`, "invalid_contract", 1024);
    if (reason !== undefined && reason.trim().length === 0) {
        throw new ReleaseValidationError("invalid_contract", "must not be blank", `${path}.reason`);
    }
    const replacedBy =
        record.replacedBy === undefined ? undefined : parseIdentifier(record.replacedBy, `${path}.replacedBy`);
    const sunsetAt = parseDateTime(record.sunsetAt, `${path}.sunsetAt`);
    if (!reason && !replacedBy && !sunsetAt) {
        throw new ReleaseValidationError("invalid_contract", "must include reason, replacedBy, or sunsetAt", path);
    }
    return {
        ...(reason ? { reason } : {}),
        ...(replacedBy ? { replacedBy } : {}),
        ...(sunsetAt ? { sunsetAt } : {}),
    };
}

function parseDateTime(value: unknown, path: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !matchesStringFormat(value, "date-time")) {
        throw new ReleaseValidationError("invalid_contract", "must be a valid date-time", path);
    }
    return value;
}
