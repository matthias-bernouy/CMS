import type { CapabilityDefinition } from "../../../interfaces/ContractRelease";
import type { ConformanceCoverageExemption, ConformanceScenario } from "../../../interfaces/Conformance";
import { parseErrorCode, parseIdentifier } from "../../parsing/identifiers";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { expectArray, expectRecord, expectString, rejectUnknownKeys } from "../../protocol/values";

export function parseCoverageExemptions(
    value: unknown,
    capabilities: readonly CapabilityDefinition[],
    scenarios: readonly ConformanceScenario[],
    limits: Readonly<ReleaseLimits>,
): readonly ConformanceCoverageExemption[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const path = "$.coverageExemptions";
    const source = expectArray(value, path, "invalid_contract");
    if (source.length > limits.maxArrayItems) {
        throw new ReleaseValidationError("invalid_contract", "too many coverage exemptions", path);
    }
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    const calls = scenarios.flatMap((scenario) => scenario.calls);
    const seen = new Set<string>();
    return source.map((item, index) => {
        const itemPath = `${path}[${index}]`;
        const record = expectRecord(item, itemPath, "invalid_contract");
        rejectUnknownKeys(record, ["capabilityId", "errorCode", "reason"], itemPath, "invalid_contract");
        const capabilityId = parseIdentifier(record.capabilityId, `${itemPath}.capabilityId`);
        const capability = byId.get(capabilityId);
        if (!capability) {
            throw new ReleaseValidationError("invalid_contract", "exemption names unknown capability", itemPath);
        }
        const reason = expectString(record.reason, `${itemPath}.reason`, "invalid_contract", 1024);
        if (reason.trim().length === 0) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "coverage exemption reason must not be blank",
                `${itemPath}.reason`,
            );
        }
        const errorCode =
            record.errorCode === undefined ? undefined : parseErrorCode(record.errorCode, `${itemPath}.errorCode`);
        if (errorCode && !capability.errors.some((error) => error.code === errorCode)) {
            throw new ReleaseValidationError("invalid_contract", "exemption names undeclared error", itemPath);
        }
        const key = `${capabilityId}:${errorCode ?? "success"}`;
        if (seen.has(key)) {
            throw new ReleaseValidationError("invalid_contract", "duplicate coverage exemption", itemPath);
        }
        seen.add(key);
        const covered = calls.some(
            (call) =>
                call.dependencyContractId === undefined &&
                call.capabilityId === capabilityId &&
                (errorCode
                    ? call.expect.kind === "error" && call.expect.code === errorCode
                    : call.expect.kind === "success" && (call.expect.checks?.length ?? 0) > 0),
        );
        if (covered) {
            throw new ReleaseValidationError("invalid_contract", "redundant coverage exemption", itemPath);
        }
        return { capabilityId, ...(errorCode ? { errorCode } : {}), reason };
    });
}
