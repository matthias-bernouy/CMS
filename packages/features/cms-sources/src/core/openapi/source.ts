import type { SourceEndpoint, EndpointParam, EndpointResponse, HTTPMethod, ParamIn, Source } from "../../interfaces/Source";
import { makeEndpointUrn, makeSourceUrn } from "../urn";
import { isValidResponseStatus, validateSource } from "../validateSource";
import { SpecParseError } from "./SpecParseError";
import { parseSpec } from "./parseSpec";
import { schemaToDataShape, shapeFromType } from "./schemaToDataShape";
import { SpecResolver } from "./SpecResolver";
import type { FullEndpoint, Operation, ParsedSpec, ResolvedParameter, SlimEndpoint } from "./types";

export type OpenApiImportOperation = {
    id: string;
    operationId?: string;
    method: HTTPMethod;
    path: string;
    summary: string;
    tags: string[];
};

export type OpenApiSourceImportOptions = {
    sourceId: string;
    baseUrl?: string;
    includeOperation?: (operation: OpenApiImportOperation) => boolean;
};

export function openApiSpecToSource(raw: string, options: OpenApiSourceImportOptions): Source {
    const sourceId = options.sourceId.trim();
    if (!sourceId) throw new SpecParseError("sourceId is required.");
    const spec = parseSpec(raw);
    const resolver = new SpecResolver(spec);
    const selected = resolver.listEndpoints()
        .map(slim => ({ slim, op: operationOf(spec, slim) }))
        .filter(({ slim, op }) => !options.includeOperation || options.includeOperation(toImportOperation(slim, op)));
    const baseUrl = selected.length ? pickBaseUrl(spec, options.baseUrl) : "";
    const usedIds = new Map<string, number>();
    const endpoints = selected
        .map(({ slim, op }) => endpointFromOperation(sourceId, uniqueId(op?.operationId || slim.id, usedIds), slim, op, resolver, baseUrl))
        .filter((e): e is SourceEndpoint => e !== null);
    const source: Source = {
        urn: makeSourceUrn(sourceId),
        meta: {
            name: spec.info.title || sourceId,
            ...(spec.info.version ? { description: `Version ${spec.info.version}` } : {}),
        },
        endpoints,
    };
    const errors = validateSource(source);
    if (errors.length) throw new SpecParseError(`Imported source is invalid:\n  - ${errors.join("\n  - ")}`);
    return source;
}

function endpointFromOperation(
    sourceId: string,
    endpointId: string,
    slim: SlimEndpoint,
    op: Operation | null,
    resolver: SpecResolver,
    baseUrl: string,
): SourceEndpoint | null {
    const full = resolver.getEndpoint(slim.id);
    if (!full) return null;
    const endpoint: SourceEndpoint = {
        urn: makeEndpointUrn(sourceId, endpointId),
        method: full.method as HTTPMethod,
        targetUrl: joinUrl(baseUrl, full.path),
        meta: { name: full.summary || endpointId, ...(full.description ? { description: full.description } : {}) },
    };
    const params = paramsOf(full);
    const body = schemaToDataShape(full.requestBody?.schema);
    if (params.length || body) endpoint.input = { ...(params.length ? { params } : {}), ...(body ? { body } : {}) };
    const output = responsesOf(resolver, slim, op);
    if (output.length) endpoint.output = output;
    return endpoint;
}

function paramsOf(full: FullEndpoint): EndpointParam[] {
    return [
        ...full.pathParams.map(p => paramOf(p, "path")),
        ...full.queryParams.map(p => paramOf(p, "query")),
        ...full.headerParams.map(p => paramOf(p, "header")),
    ];
}

function paramOf(p: ResolvedParameter, location: ParamIn): EndpointParam {
    return {
        name: p.name,
        in: location,
        required: p.required,
        description: p.description || undefined,
        schema: shapeFromType(p.type),
    };
}

function responsesOf(resolver: SpecResolver, slim: SlimEndpoint, op: Operation | null): EndpointResponse[] {
    if (!op?.responses || Object.keys(op.responses).length === 0) return [];
    const out: EndpointResponse[] = [];
    for (const response of resolver.listResponses(slim.id)) {
        if (!isValidResponseStatus(response.status)) continue;
        const body = schemaToDataShape(response.schema);
        out.push(body ? { status: response.status, body } : { status: response.status });
    }
    return out;
}

function pickBaseUrl(spec: ParsedSpec, override?: string): string {
    const url = (override || spec.servers[0]?.url || "").replace(/\/+$/, "");
    try { new URL(url); } catch { throw new SpecParseError("Spec has no absolute server URL; pass baseUrl."); }
    return url;
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function uniqueId(raw: string, used: Map<string, number>): string {
    const base = slug(raw) || "endpoint";
    const next = (used.get(base) ?? 0) + 1;
    used.set(base, next);
    return next === 1 ? base : `${base}-${next}`;
}

function slug(value: string): string {
    return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function operationOf(spec: ParsedSpec, slim: SlimEndpoint): Operation | null {
    return (spec.paths[slim.path] as Record<string, unknown> | undefined)?.[slim.method.toLowerCase()] as Operation | undefined ?? null;
}

function toImportOperation(slim: SlimEndpoint, op: Operation | null): OpenApiImportOperation {
    return { id: slim.id, operationId: op?.operationId, method: slim.method as HTTPMethod, path: slim.path, summary: slim.summary, tags: slim.tags };
}
