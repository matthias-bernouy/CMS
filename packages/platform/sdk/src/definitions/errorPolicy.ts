import { CapabilityFailure } from "ulvia-sdk/definitions/errors";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import type { FeatureDefinition, FeatureErrorMapper, FeatureErrorMapping } from "ulvia-sdk/interfaces/features";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Capture trusted code together with the default executor; it never enters a contract artifact. */
export function featureErrorMapper(feature: FeatureDefinition): FeatureErrorMapper | undefined {
    const mapper = feature.mapError;
    if (mapper !== undefined && typeof mapper !== "function") {
        throw new SdkDefinitionError("Feature mapError must be a function");
    }
    return mapper;
}

export async function executeWithErrorMapping<Result>(
    capability: CapabilitySource,
    mapper: FeatureErrorMapper | undefined,
    execute: () => Result | Promise<Result>,
): Promise<Result> {
    try {
        return await execute();
    } catch (cause) {
        // Explicit failures retain their exact owner, including foreign failures refused by the Provider bridge.
        if (cause instanceof CapabilityFailure || !mapper) {
            throw cause;
        }
        const mapped = mapper(cause, capability);
        if (mapped === undefined) {
            throw cause;
        }
        throw mappedFailure(capability, mapped, cause);
    }
}

function mappedFailure(capability: CapabilitySource, mapping: FeatureErrorMapping, cause: unknown): CapabilityFailure {
    if (
        !mapping ||
        typeof mapping !== "object" ||
        typeof mapping.code !== "string" ||
        !Object.hasOwn(capability.errors, mapping.code)
    ) {
        throw new SdkDefinitionError("Feature mapError returned an undeclared capability error");
    }
    const schema = capability.errors[mapping.code]!.output;
    if (!schema && Object.hasOwn(mapping, "output")) {
        throw new SdkDefinitionError("This capability error has no payload");
    }
    const output = schema?.parse(mapping.output);
    return new CapabilityFailure(capability, mapping.code, output === undefined ? undefined : structuredClone(output), {
        cause,
    });
}

/** Local feature execution must resolve the same declaring owner as Provider mounting. */
export function featureCapability(feature: FeatureDefinition, id: string) {
    const seen = new Set<FeatureDefinition>();
    let current: FeatureDefinition | undefined = feature;
    while (current) {
        if (seen.has(current) || seen.size >= 24) {
            throw new SdkDefinitionError("Cyclic or oversized feature lineage");
        }
        seen.add(current);
        const capability = current.capabilities.find((candidate) => candidate.id === id);
        if (capability) {
            return { capability, mapper: featureErrorMapper(current) };
        }
        current = current.extends;
    }
    throw new SdkDefinitionError(`Unknown feature capability: ${id}`);
}
