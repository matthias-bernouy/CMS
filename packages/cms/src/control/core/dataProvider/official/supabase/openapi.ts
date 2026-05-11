import spec from "./openapi.json" with { type: "json" };

/**
 * Embedded Supabase GoTrue OpenAPI spec. The JSON file lives next to this
 * module and ships with the package; nothing is fetched at provider create
 * time. The `{{PROJECT_URL}}` placeholder in `servers[0].url` is substituted
 * with the user-supplied Supabase project URL before persistence.
 *
 * Returns a JSON-stringified spec — same wire format as a synced spec, so
 * the rest of the CMS (parseSpec, countOpenApiEndpoints, mocks, …) treats
 * an official provider exactly like a URL-sourced one.
 */
export function buildSupabaseOpenApi(projectUrl: string): string {
    return JSON.stringify(spec).replace(/\{\{PROJECT_URL\}\}/g, projectUrl);
}
