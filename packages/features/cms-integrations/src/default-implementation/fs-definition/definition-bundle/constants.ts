export const INTEGRATION_DEFINITION_SCHEMAS = [
    "cms.integration.definition.v1",
    "cms.integration.definition.v2",
] as const;
export const INTEGRATION_DEFINITION_BUNDLE_SCHEMA = "cms.integration.definition.bundle.v1";

export const INTEGRATION_DEFINITION_BUNDLE_LIMITS = {
    maxDepth: 32,
    maxFiles: 4_096,
    maxBytes: 16 * 1_024 * 1_024,
} as const;
