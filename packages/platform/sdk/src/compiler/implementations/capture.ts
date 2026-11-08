import { factoryExecution } from "ulvia-sdk/definitions/execution/factories";
import type { ContractImplementation } from "ulvia-sdk/interfaces/providers";
import { captureLineage } from "ulvia-sdk/compiler/implementations/lineage";
import { SDK_BUILD_LIMITS } from "ulvia-sdk/compiler/limits";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function captureImplementations<Dependencies>(sources: readonly ContractImplementation<Dependencies>[]) {
    if (sources.length > SDK_BUILD_LIMITS.contracts) {
        throw new SdkDefinitionError("Too many implementation definitions");
    }
    return sources.map((source) => {
        const { capabilities, lineage } = captureLineage(source.feature);
        const handlers = Object.freeze({ ...source.handlers });
        const expected = [...capabilities.keys()].sort();
        const actual = Object.keys(handlers).sort();
        if (
            expected.length !== actual.length ||
            expected.some((id, index) => actual[index] !== id) ||
            actual.some((id) => typeof handlers[id] !== "function")
        ) {
            throw new SdkDefinitionError(`Handler table does not match ${source.feature.contractId}`);
        }
        const defaultOperations = new Set(
            actual.filter((id) => {
                const mode = factoryExecution(handlers[id]!);
                if (mode !== undefined && mode !== capabilities.get(id)!.behavior.execution) {
                    throw new SdkDefinitionError("Default executor mode differs from its capability definition");
                }
                return mode === "operation";
            }),
        );
        return {
            feature: source.feature,
            contractId: source.feature.contractId,
            version: source.feature.version,
            handlers,
            defaultOperations,
            capabilities,
            lineage,
            requires: structuredClone(source.requires ?? []),
            ...(source.delegation ? { delegation: structuredClone(source.delegation) } : {}),
        };
    });
}

export type CapturedImplementation<Dependencies> = ReturnType<typeof captureImplementations<Dependencies>>[number];
