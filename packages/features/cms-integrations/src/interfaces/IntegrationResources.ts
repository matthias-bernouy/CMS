export const INTEGRATION_DEFINITION_SCHEMA_V1 = "cms.integration.definition.v1" as const;
export const INTEGRATION_DEFINITION_SCHEMA_V2 = "cms.integration.definition.v2" as const;
export const ULVIA_THEME_CONTRACT_V1 = "ulvia-theme@1" as const;
export const ULVIA_THEME_CONTRACT_V2 = "ulvia-theme@2" as const;
export const ULVIA_THEME_CONTRACT_V3 = "ulvia-theme@3" as const;

export type UlviaThemeContract =
    | typeof ULVIA_THEME_CONTRACT_V1
    | typeof ULVIA_THEME_CONTRACT_V2
    | typeof ULVIA_THEME_CONTRACT_V3;

export type IntegrationType = "source" | "collection";

export type CollectionResourceCategory = {
    id: string;
    label: string;
    description?: string;
};

export type CollectionBindingValue = `props.${string}` | `state.${string}` | `context.${string}` | `route.${string}`;

export type CollectionEndpointBindings = {
    /** Endpoint input path (`params.<name>` or `body.<path>`) to bloc value. */
    input?: Record<string, CollectionBindingValue>;
    /** Bloc value to endpoint response path (`<status>.body.<path>`). */
    output?: Record<CollectionBindingValue, string>;
    /** Bloc value to endpoint error response path (`<status>.body.<path>`). */
    errors?: Record<CollectionBindingValue, string>;
};

export type CollectionEndpointRequirement = {
    /** Integration package providing the endpoint. */
    source: string;
    sourceVersion: string;
    endpoint: `urn:${string}:${string}`;
    contractVersion: string;
    bindings?: CollectionEndpointBindings;
};

export type CollectionThemeOptionalToken = {
    id: string;
    fallback: string;
};

export type CollectionThemeRequirement = {
    contract: UlviaThemeContract;
    required?: string[];
    optional?: CollectionThemeOptionalToken[];
};

export type CollectionRequirement = {
    /** Collection package providing the required resources. */
    kind: string;
    versionRange: string;
    resources: string[];
};

export type CollectionResourceRequirements = {
    /** Resource ids in the same collection. */
    resources?: string[];
    /** Explicit resources provided by other collection packages. */
    collections?: CollectionRequirement[];
};

export type CollectionBlocResource = {
    id: string;
    type: "bloc";
    /** Stable custom-element tag of the matching bloc artifact. */
    artifact: string;
    category: string;
    defaultActive?: boolean;
    endpoints?: CollectionEndpointRequirement[];
    requires?: CollectionResourceRequirements;
    context?: string[];
    theme?: CollectionThemeRequirement;
};

export type CollectionResource = CollectionBlocResource;

export type CollectionSelection = {
    activeResources: string[];
    effectiveResources: Array<{ kind: string; resources: string[] }>;
    requiredCollections: Array<{ kind: string; version: string; resources: string[] }>;
    requiredSources: Array<{ kind: string; versionRange: string }>;
};
