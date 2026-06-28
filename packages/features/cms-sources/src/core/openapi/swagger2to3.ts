/**
 * Convert a Swagger 2.0 spec to an OpenAPI 3.0-shaped object that the
 * rest of the resolver pipeline can consume without conditional branches.
 *
 * Scope:
 *  - moves `definitions` → `components.schemas`
 *  - rewrites every `$ref` from `#/definitions/...` to `#/components/schemas/...`
 *  - inlines Swagger `#/parameters/...` refs into operation parameters
 *  - wraps each response's bare `schema` in `content["application/json"].schema`
 *  - moves operation `in: "body"` parameters to JSON `requestBody`
 *
 * Out of scope (left as-is):
 *  - global `consumes` / `produces` / `host` / `basePath` (resolver doesn't read them)
 *  - `formData` parameters (multipart/x-www-form-urlencoded import is not modelled yet)
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
            normaliseParameters(item as Record<string, unknown>, rewritten.parameters);
            moveBodyParameters(item as Record<string, unknown>);
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

function normaliseParameters(pathItem: Record<string, unknown>, rawGlobal: unknown): void {
    const methods = ["get", "post", "put", "delete", "patch", "head", "options"];
    const global = rawGlobal && typeof rawGlobal === "object" ? rawGlobal as Record<string, unknown> : {};
    if (Array.isArray(pathItem.parameters)) pathItem.parameters = normaliseParameterList(pathItem.parameters, global);
    for (const m of methods) {
        const op = pathItem[m] as Record<string, unknown> | undefined;
        if (!op || !Array.isArray(op.parameters)) continue;
        op.parameters = normaliseParameterList(op.parameters, global);
    }
}

function normaliseParameterList(params: unknown[], global: Record<string, unknown>): Record<string, unknown>[] {
    return params.map(p => normaliseParameter(resolveParameterRef(p, global)));
}

function resolveParameterRef(raw: unknown, global: Record<string, unknown>): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const ref = (raw as { $ref?: unknown }).$ref;
    if (typeof ref !== "string") return raw as Record<string, unknown>;
    const key = ref.match(/^#\/parameters\/(.+)$/)?.[1];
    const found = key ? global[key] : undefined;
    return found && typeof found === "object" && !Array.isArray(found) ? found as Record<string, unknown> : raw as Record<string, unknown>;
}

function normaliseParameter(raw: Record<string, unknown>): Record<string, unknown> {
    if (raw.schema || typeof raw.type !== "string") return raw;
    const { type, format, enum: values, default: defaultValue, ...rest } = raw;
    return { ...rest, schema: { type, ...(typeof format === "string" ? { format } : {}), ...(Array.isArray(values) ? { enum: values } : {}), ...(defaultValue !== undefined ? { default: defaultValue } : {}) } };
}

function moveBodyParameters(pathItem: Record<string, unknown>): void {
    const methods = ["get", "post", "put", "delete", "patch", "head", "options"];
    for (const m of methods) {
        const op = pathItem[m] as Record<string, unknown> | undefined;
        const params = Array.isArray(op?.parameters) ? op.parameters as Record<string, unknown>[] : [];
        const body = params.find(p => p.in === "body" && p.schema);
        if (!op || !body || op.requestBody) continue;
        op.requestBody = {
            description: typeof body.description === "string" ? body.description : "",
            required: body.required === true,
            content: { "application/json": { schema: body.schema } },
        };
        op.parameters = params.filter(p => p.in !== "body");
    }
}
