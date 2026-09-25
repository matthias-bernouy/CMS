import { parseIdentifier } from "../../parsing/identifiers";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { expectArray, expectRecord } from "../../protocol/values";

export interface CalledCapability {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly path: string;
}

/** Collect call targets before resolving profiles; schema/template validation follows for each profile. */
export function collectCalledCapabilities(
    value: unknown,
    rootId: string,
    limits: Readonly<ReleaseLimits>,
): readonly CalledCapability[] {
    const scenarios = expectArray(value, "$.scenarios", "invalid_contract");
    if (!scenarios.length || scenarios.length > limits.maxConformanceScenarios) {
        throw new ReleaseValidationError("invalid_contract", "invalid number of conformance scenarios", "$.scenarios");
    }
    return scenarios.flatMap((item, index) => {
        const path = `$.scenarios[${index}]`;
        const scenario = expectRecord(item, path, "invalid_contract");
        const calls = expectArray(scenario.calls, `${path}.calls`, "invalid_contract");
        if (!calls.length || calls.length > limits.maxConformanceCallsPerScenario) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "invalid number of conformance calls",
                `${path}.calls`,
            );
        }
        return calls.map((call, callIndex) => {
            const callPath = `${path}.calls[${callIndex}]`;
            const record = expectRecord(call, callPath, "invalid_contract");
            const contractId =
                record.dependencyContractId === undefined
                    ? rootId
                    : parseIdentifier(record.dependencyContractId, `${callPath}.dependencyContractId`, 96);
            if (record.dependencyContractId !== undefined && contractId === rootId) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "local calls must omit dependencyContractId",
                    callPath,
                );
            }
            return {
                contractId,
                capabilityId: parseIdentifier(record.capabilityId, `${callPath}.capabilityId`),
                path: callPath,
            };
        });
    });
}
