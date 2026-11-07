import { ReleaseValidationError } from "../protocol/errors";
import { expectRecord, expectString, rejectUnknownKeys } from "../protocol/values";
import type { CapabilityDeprecation } from "../../interfaces/ContractRelease";
import { matchesStringFormat } from "../schema/formats";
import { parseIdentifier } from "./identifiers";

export function parseCapabilityDeprecation(value: unknown, path: string): CapabilityDeprecation {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["reason", "replacedBy", "sunsetAt", "retirement"], path, "invalid_contract");
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
    if (record.retirement !== undefined && (record.retirement !== true || !reason || replacedBy)) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "retirement must be true, include a reason and have no replacement",
            `${path}.retirement`,
        );
    }
    if (!reason && !replacedBy && !sunsetAt) {
        throw new ReleaseValidationError("invalid_contract", "must include reason, replacedBy, or sunsetAt", path);
    }
    return {
        ...(record.retirement ? { retirement: true as const } : {}),
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

import type { ContractRelease } from "../../interfaces/ContractRelease";
export function validateDeprecationReferences(
    capabilities: ContractRelease["capabilities"],
    unresolvedParent = false,
): void {
    rejectDeprecationCycles(capabilities);
    const ids = new Set(capabilities.map((capability) => capability.id));
    for (const capability of capabilities) {
        const replacement = capability.deprecation?.replacedBy;
        if (replacement && ((!unresolvedParent && !ids.has(replacement)) || replacement === capability.id)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `replacement ${JSON.stringify(replacement)} must identify another capability in the release`,
                `$.capabilities.${capability.id}.deprecation.replacedBy`,
            );
        }
    }
}

function rejectDeprecationCycles(capabilities: ContractRelease["capabilities"]): void {
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    const completed = new Set<string>();
    for (const capability of capabilities) {
        const visited = new Set<string>();
        let current: string | undefined = capability.id;
        while (current && !completed.has(current)) {
            if (visited.has(current)) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "capability deprecation contains a replacement cycle",
                    `$.capabilities.${capability.id}.deprecation`,
                );
            }
            visited.add(current);
            current = byId.get(current)?.deprecation?.replacedBy;
        }
        for (const id of visited) {
            completed.add(id);
        }
    }
}
