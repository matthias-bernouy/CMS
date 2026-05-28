import type {
    FullEndpoint,
    JSONSchema,
    Operation,
    ParsedSpec,
    Parameter,
    ResolvedParameter,
    ResolvedRequestBody,
    ResponseChoice,
    SlimEndpoint,
} from "./types";
import { deref } from "./helpers/deref";
import { flattenSchema } from "./helpers/flattenSchema";
import { stubFromSchema } from "./stubFromSchema";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/**
 * Read-only projector over a `ParsedSpec`. One instance per provider,
 * cached at the API layer so the heavy lifting (dereferencing nested
 * schemas, flattening for autocomplete) is amortized across requests.
 */
export class SpecResolver {

    constructor(private readonly _spec: ParsedSpec) {}

    /**
     * Resolve a concrete URL path (e.g. `/users/123`) to the OpenAPI
     * templated path that declares the operation (e.g. `/users/{id}`).
     * Static paths win over templated ones for the same URL. Returns null
     * when no path declares the given verb for that URL.
     */
    matchOperationPath(method: string, urlPath: string): string | null {
        const verb       = method.toUpperCase();
        const candidates = this.listEndpoints().filter(ep => ep.method === verb);
        const normalized = stripTrailingSlash(urlPath || "/");
        for (const ep of candidates) {
            if (stripTrailingSlash(ep.path) === normalized) return ep.path;
        }
        for (const ep of candidates) {
            if (ep.path.indexOf("{") < 0) continue;
            if (matchTemplate(ep.path, normalized)) return ep.path;
        }
        return null;
    }

    listEndpoints(): SlimEndpoint[] {
        const out: SlimEndpoint[] = [];
        for (const [path, item] of Object.entries(this._spec.paths)) {
            if (!item || typeof item !== "object") continue;
            for (const method of HTTP_METHODS) {
                const op = item[method];
                if (op) out.push(toSlim(method, path, op));
            }
        }
        return out;
    }

    getEndpoint(id: string): FullEndpoint | null {
        const found = this._findOperation(id);
        if (!found) return null;
        const { method, path, op, item } = found;
        const params = mergeParams(item.parameters, op.parameters);
        const byLoc  = (loc: Parameter["in"]) =>
            params.filter(p => p.in === loc).map(p => derefParameter(p, this._spec));

        return {
            ...toSlim(method, path, op),
            description:    op.description ?? "",
            pathParams:     byLoc("path"),
            queryParams:    byLoc("query"),
            headerParams:   byLoc("header"),
            requestBody:    derefRequestBody(op, this._spec),
            responseSchema: this._pickResponseSchema(op),
        };
    }

    getResponseSchema(id: string, status = "200"): JSONSchema | null {
        const found = this._findOperation(id);
        if (!found) return null;
        return this._pickResponseSchema(found.op, status);
    }

    /** Flat dotted paths into the response schema, for the richtextbar. */
    getResponseFields(id: string): string[] {
        const schema = this.getResponseSchema(id);
        return schema ? flattenSchema(schema) : [];
    }

    /**
     * Every JSON response declared by the operation, with a pre-rendered
     * stub body. Used by the mockup-create UI to populate the status
     * dropdown and pre-fill the body for the picked status.
     *
     * Falls back to a synthetic 200 entry when the spec declares no
     * responses, so the UI always has at least one usable status.
     */
    listResponses(id: string): ResponseChoice[] {
        const found = this._findOperation(id);
        const out: ResponseChoice[] = [];
        if (!found) return [{ status: "200", description: "", defaultBody: "{}", schema: null }];

        const responses = found.op.responses ?? {};
        const keys = Object.keys(responses);
        for (const status of keys) {
            const entry = responses[status];
            const json  = entry?.content?.["application/json"];
            const example = json?.example;
            const schema  = json?.schema ? deref(json.schema, this._spec) : null;
            const body    = example !== undefined ? example : stubFromSchema(schema);
            out.push({
                status,
                description: entry?.description ?? "",
                defaultBody: JSON.stringify(body, null, 2),
                schema,
            });
        }
        if (out.length === 0) out.push({ status: "200", description: "", defaultBody: "{}", schema: null });
        return out;
    }

    search(query: string): SlimEndpoint[] {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return this.listEndpoints().filter(ep =>
            ep.path.toLowerCase().includes(q) ||
            ep.summary.toLowerCase().includes(q) ||
            ep.tags.some(t => t.toLowerCase().includes(q))
        );
    }

    private _findOperation(id: string) {
        const space = id.indexOf(" ");
        if (space < 0) return null;
        const method = id.slice(0, space).toLowerCase() as keyof Operation;
        const path   = id.slice(space + 1);
        const item   = this._spec.paths[path];
        if (!item) return null;
        const op = (item as Record<string, unknown>)[method] as Operation | undefined;
        if (!op) return null;
        return { method: method as string, path, op, item };
    }

    private _pickResponseSchema(op: Operation, status = "200"): JSONSchema | null {
        const responses = op.responses ?? {};
        const tries = [status, "default", ...Object.keys(responses).filter(k => /^2\d\d$/.test(k))];
        for (const k of tries) {
            const schema = responses[k]?.content?.["application/json"]?.schema;
            if (schema) return deref(schema, this._spec);
        }
        return null;
    }
}

function matchTemplate(template: string, concrete: string): boolean {
    const t = stripTrailingSlash(template).split("/");
    const c = stripTrailingSlash(concrete).split("/");
    if (t.length !== c.length) return false;
    for (let i = 0; i < t.length; i++) {
        const seg = t[i]!;
        if (seg.startsWith("{") && seg.endsWith("}")) { if (!c[i]) return false; continue; }
        if (seg !== c[i]) return false;
    }
    return true;
}

function stripTrailingSlash(p: string): string {
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function toSlim(method: string, path: string, op: Operation): SlimEndpoint {
    const m = method.toUpperCase();
    return {
        id:      `${m} ${path}`,
        method:  m,
        path,
        summary: op.summary ?? "",
        tags:    Array.isArray(op.tags) ? [...op.tags] : [],
    };
}

function mergeParams(a?: Parameter[], b?: Parameter[]): Parameter[] {
    const merged = new Map<string, Parameter>();
    for (const p of a ?? []) merged.set(`${p.in}:${p.name}`, p);
    for (const p of b ?? []) merged.set(`${p.in}:${p.name}`, p);
    return Array.from(merged.values());
}

function derefParameter(p: Parameter, spec: ParsedSpec): ResolvedParameter {
    const schema = p.schema ? deref(p.schema, spec) : undefined;
    return {
        name:        p.name,
        type:        schema?.type ?? "string",
        required:    p.required === true || p.in === "path",
        description: p.description ?? "",
    };
}

function derefRequestBody(op: Operation, spec: ParsedSpec): ResolvedRequestBody | null {
    const body = op.requestBody;
    if (!body || !body.content) return null;
    const json = body.content["application/json"];
    if (!json) {
        const firstType = Object.keys(body.content)[0];
        if (!firstType) return null;
        return {
            description: body.description ?? "",
            required:    body.required === true,
            contentType: firstType,
            schema:      body.content[firstType]?.schema ? deref(body.content[firstType]!.schema!, spec) : null,
        };
    }
    return {
        description: body.description ?? "",
        required:    body.required === true,
        contentType: "application/json",
        schema:      json.schema ? deref(json.schema, spec) : null,
    };
}
