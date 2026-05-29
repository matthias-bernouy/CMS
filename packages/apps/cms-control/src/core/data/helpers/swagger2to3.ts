/**
 * Convert a Swagger 2.0 spec to an OpenAPI 3.0-shaped object that the
 * rest of the resolver pipeline can consume without conditional branches.
 *
 * Scope:
 *  - moves `definitions` → `components.schemas`
 *  - rewrites every `$ref` from `#/definitions/...` to `#/components/schemas/...`
 *  - wraps each response's bare `schema` in `content["application/json"].schema`
 *
 * Out of scope (left as-is):
 *  - body parameters (`in: "body"`) → 3.x's `requestBody` (rare in our APIs)
 *  - global `consumes` / `produces` / `host` / `basePath` (resolver doesn't read them)
 *  - security definitions (we don't render them yet)
 *
 * Returns a fresh object — input is not mutated.
 */
export function swagger2to3(json: unknown): Record<string, unknown> {
    const root  = (json && typeof json === "object") ? json as Record<string, unknown> : {};
    const cloned = deepClone(root);
    const rewritten = rewriteRefs(cloned);

    if (rewritten.paths && typeof rewritten.paths === "object") {
        for (const item of Object.values(rewritten.paths as Record<string, unknown>)) {
            wrapResponseSchemas(item as Record<string, unknown>);
        }
    }

    const definitions = rewritten.definitions as Record<string, unknown> | undefined;
    return {
        openapi:    "3.0.0",
        info:       rewritten.info       ?? {},
        paths:      rewritten.paths      ?? {},
        components: { schemas: definitions ?? {} },
        servers:    deriveServers(root),
    };
}

/**
 * Translate Swagger 2.0's split `schemes` + `host` + `basePath` triplet
 * into the OpenAPI 3.x `servers` shape. Returns an empty array when any
 * required field is missing — we never fabricate a server URL.
 */
function deriveServers(root: Record<string, unknown>): { url: string }[] {
    const host = typeof root.host === "string" ? root.host : "";
    if (!host) return [];
    const schemes = Array.isArray(root.schemes) ? root.schemes : [];
    const proto   = typeof schemes[0] === "string" ? schemes[0] : "https";
    const base    = typeof root.basePath === "string" ? root.basePath : "";
    return [{ url: `${proto}://${host}${base}` }];
}

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function rewriteRefs(node: any): any {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(rewriteRefs);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
        if (k === "$ref" && typeof v === "string") {
            out[k] = v.replace(/^#\/definitions\//, "#/components/schemas/");
        } else {
            out[k] = rewriteRefs(v);
        }
    }
    return out;
}

function wrapResponseSchemas(pathItem: Record<string, unknown>): void {
    const methods = ["get", "post", "put", "delete", "patch", "head", "options"];
    for (const m of methods) {
        const op = pathItem[m] as Record<string, unknown> | undefined;
        if (!op || !op.responses || typeof op.responses !== "object") continue;
        for (const resp of Object.values(op.responses as Record<string, unknown>)) {
            if (!resp || typeof resp !== "object") continue;
            const r = resp as Record<string, unknown>;
            if (r.schema) {
                r.content = { "application/json": { schema: r.schema } };
                delete r.schema;
            }
        }
    }
}
