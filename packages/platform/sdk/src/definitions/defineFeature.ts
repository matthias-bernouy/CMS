import type { FeatureDefinition, FeatureServiceCompatibility } from "ulvia-sdk/interfaces/features";

/** One immutable feature source drives contract generation and complete Provider execution. */
export function defineFeature<const Definition extends FeatureDefinition>(
    definition: Definition & FeatureServiceCompatibility<NoInfer<Definition>>,
): Readonly<Definition> {
    return Object.freeze({
        ...definition,
        capabilities: Object.freeze([...definition.capabilities]),
    }) as Readonly<Definition>;
}
