import type { TenantConfigSchema } from "src/interfaces/TenantConfigSchema";

/**
 * Build the body served at `GET /openapi.tenant-config.json` (base.md §11.2).
 * The hub fetches it once at provider import, caches by `version`. We attach
 * the JSON-Schema dialect URI + the version, then splat the raw schema.
 */
export function buildTenantConfigSpec(
    tc: TenantConfigSchema,
): Record<string, unknown> {
    return {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        version: tc.version,
        ...tc.schema,
    };
}
