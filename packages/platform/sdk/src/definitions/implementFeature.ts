import { DEFAULT_RELEASE_LIMITS } from "@bernouy/ulvia-contracts";
import type { FeatureDefinition, FeatureServices } from "ulvia-sdk/interfaces/features";
import type { CapabilitySource } from "ulvia-sdk/interfaces/capabilities";
import type { CapabilityExecutor } from "ulvia-sdk/interfaces/execution";
import type { ContractImplementation, ImplementationOptions } from "ulvia-sdk/interfaces/providers";
import { capabilityFailure } from "ulvia-sdk/definitions/errors";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

export function implementFeature<const Feature extends FeatureDefinition>(
    feature: Feature,
    options?: ImplementationOptions,
): ContractImplementation<FeatureServices<Feature>>;
export function implementFeature<const Feature extends FeatureDefinition, Dependencies>(
    feature: Feature,
    options: ImplementationOptions & { readonly services: (dependencies: Dependencies) => FeatureServices<Feature> },
): ContractImplementation<Dependencies>;
export function implementFeature(
    feature: FeatureDefinition,
    options: ImplementationOptions & { readonly services?: (dependencies: never) => unknown } = {},
): ContractImplementation<never> {
    const { services: selectServices, ...claims } = options;
    const handlers: Record<string, (dependencies: never) => unknown> = Object.create(null);
    const seen = new Set<FeatureDefinition>();
    let current: FeatureDefinition | undefined = feature;
    while (current) {
        if (seen.has(current) || seen.size >= 24) {
            throw new SdkDefinitionError("Cyclic or oversized feature lineage");
        }
        seen.add(current);
        if (
            !Array.isArray(current.capabilities) ||
            current.capabilities.length > DEFAULT_RELEASE_LIMITS.maxCapabilities
        ) {
            throw new SdkDefinitionError("Feature capabilities must be a bounded list");
        }
        for (const capability of current.capabilities) {
            if (Object.hasOwn(handlers, capability.id)) {
                throw new SdkDefinitionError(`Cannot redeclare inherited capability ${capability.id}`);
            }
            const execute = (
                capability as CapabilitySource & { execute?: CapabilityExecutor<CapabilitySource, unknown> }
            ).execute;
            if (typeof execute !== "function") {
                throw new SdkDefinitionError(`Missing execute for ${capability.id}`);
            }
            const fail = capabilityFailure(capability);
            handlers[capability.id] = (dependencies) => {
                const services = selectServices ? selectServices(dependencies) : dependencies;
                return (input: never, context: never) => execute({ input, services, context, fail });
            };
        }
        current = current.extends;
    }
    return Object.freeze({ ...claims, feature, handlers: Object.freeze(handlers) });
}
