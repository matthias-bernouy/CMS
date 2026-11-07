import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import type {
    ContractImplementation,
    HandlerFactories,
    ImplementationOptions,
    ProviderDefinition,
} from "ulvia-sdk/interfaces/providers";

export function implementContract<const Feature extends FeatureDefinition, Dependencies>(
    feature: Feature,
    handlers: HandlerFactories<NoInfer<Feature>, Dependencies> &
        Readonly<Record<string, (dependencies: Dependencies) => unknown>>,
    options: ImplementationOptions = {},
): ContractImplementation<Dependencies> {
    return Object.freeze({ ...options, feature, handlers: Object.freeze({ ...handlers }) });
}

export function defineProvider<Dependencies>(
    definition: ProviderDefinition<Dependencies>,
): ProviderDefinition<Dependencies> {
    return Object.freeze({ ...definition, implementations: Object.freeze([...definition.implementations]) });
}
