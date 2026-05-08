/**
 * Count the number of paths declared in an OpenAPI spec. Tolerant: returns
 * 0 if the input is empty, not JSON, or doesn't look like OpenAPI. Doesn't
 * resolve `$ref`s — counts only top-level path keys, which is enough for
 * the admin overview.
 */
export function countOpenApiEndpoints(spec: string): number {
    if (!spec) return 0;
    try {
        const json = JSON.parse(spec);
        if (json && typeof json === "object" && json.paths && typeof json.paths === "object") {
            return Object.keys(json.paths).length;
        }
    } catch { /* not JSON or malformed — treat as zero */ }
    return 0;
}

/** Sync state badge fields for the admin Data table. */
export function dataProviderSyncBadge(lastSyncAt: Date | null): { label: string; color: string } {
    if (!lastSyncAt) return { label: "Never synced", color: "" };
    return { label: "Synced", color: "success" };
}
