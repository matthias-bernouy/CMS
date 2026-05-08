import type {
    FullEndpoint,
    JSONSchema,
    Operation,
    ParsedSpec,
    Parameter,
    ResolvedParameter,
    ResolvedRequestBody,
    SlimEndpoint,
    TagSummary,
} from "./types";
import { deref } from "./helpers/deref";
import { flattenSchema } from "./helpers/flattenSchema";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/**
 * Read-only projector over a `ParsedSpec`. One instance per provider,
 * cached at the API layer so the heavy lifting (dereferencing nested
 * schemas, flattening for autocomplete) is amortized across requests.
 */
export class SpecResolver {

    constructor(private readonly _spec: ParsedSpec) {}

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

    listTags(): TagSummary[] {
        const counts = new Map<string, number>();
        for (const ep of this.listEndpoints()) {
            for (const tag of ep.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
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
