import type { CapabilityDefinition, ContractFixtureAssetDefinition } from "../../interfaces/ContractRelease";
import type { ConformanceScenario } from "../../interfaces/Conformance";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import { ReleaseValidationError } from "../protocol/errors";
import type { ReleaseLimits } from "../protocol/limits";
import { expectArray, expectRecord, optionalString, rejectUnknownKeys } from "../protocol/values";
import { parseIdentifier } from "../parsing/identifiers";
import { parseConformanceCall } from "./parseCall";

export function parseConformanceScenarios(
    value: unknown,
    capabilities: readonly CapabilityDefinition[],
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
    limits: Readonly<ReleaseLimits>,
): readonly ConformanceScenario[] {
    const path = "$.scenarios";
    const source = expectArray(value, path, "invalid_contract");
    if (source.length === 0 || source.length > limits.maxConformanceScenarios) {
        throw new ReleaseValidationError("invalid_contract", "invalid number of conformance scenarios", path);
    }
    const byId = new Map(capabilities.map((capability) => [capability.id, capability]));
    const scenarios = source.map((item, index) =>
        parseScenario(item, `${path}[${index}]`, byId, assets, referencedAssets, limits),
    );
    if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate conformance scenario IDs", path);
    }
    return scenarios;
}

function parseScenario(
    value: unknown,
    path: string,
    capabilities: ReadonlyMap<string, CapabilityDefinition>,
    assets: ReadonlyMap<string, ContractFixtureAssetDefinition>,
    referencedAssets: Set<string>,
    limits: Readonly<ReleaseLimits>,
): ConformanceScenario {
    const record = expectRecord(value, path, "invalid_contract");
    rejectUnknownKeys(record, ["id", "description", "calls"], path, "invalid_contract");
    const source = expectArray(record.calls, `${path}.calls`, "invalid_contract");
    if (source.length === 0 || source.length > limits.maxConformanceCallsPerScenario) {
        throw new ReleaseValidationError("invalid_contract", "invalid number of conformance calls", `${path}.calls`);
    }
    const captures = new Map<string, UlviaSchema>();
    const calls = source.map((item, index) =>
        parseConformanceCall(item, `${path}.calls[${index}]`, capabilities, captures, assets, referencedAssets, limits),
    );
    if (new Set(calls.map((call) => call.id)).size !== calls.length) {
        throw new ReleaseValidationError("invalid_contract", "duplicate conformance call IDs", `${path}.calls`);
    }
    const description = optionalString(record.description, `${path}.description`, "invalid_contract", 4096);
    return {
        id: parseIdentifier(record.id, `${path}.id`),
        ...(description ? { description } : {}),
        calls,
    };
}
