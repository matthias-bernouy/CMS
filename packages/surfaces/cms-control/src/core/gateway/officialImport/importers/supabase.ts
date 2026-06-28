import {
    openApiSpecToSource,
    parseDataShape,
    validateSource,
    type DataShape,
    type SourceEndpoint,
    type EndpointHeader,
    type EndpointResponse,
    type Source,
} from "@bernouy/cms-sources";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { SupabaseOfficialProviderImportDto } from "cms-control/core/validation/gateway/parseOfficialProviderImportDto";
import type { OfficialProviderImportResult } from "../types";

const RPC_OUTPUT_METADATA_FUNCTION = "cms_gateway_rpc_output_shapes";

export async function importSupabaseOfficialProvider(
    dto: SupabaseOfficialProviderImportDto,
): Promise<OfficialProviderImportResult> {
    const restUrl = normalizeSupabaseRestUrl(dto.projectUrl);
    const schema = dto.schema ?? "public";
    const secretKey = supabaseSecretKey(dto.id);
    const secretRef = secretKeyToRef(secretKey);
    const spec = await fetchSupabaseOpenApi(restUrl, dto.apiKey, schema);
    const source = openApiSpecToSource(spec, {
        sourceId: dto.id,
        baseUrl: restUrl.replace(/\/+$/, ""),
    });
    source.endpoints = source.endpoints.filter(endpoint => rpcFunctionName(endpoint) !== RPC_OUTPUT_METADATA_FUNCTION);
    const rpcOutputShapes = hasRpcEndpoints(source)
        ? await fetchSupabaseRpcOutputShapes(restUrl, dto.apiKey, schema)
        : new Map<string, DataShape>();

    source.meta = mergeMeta(source, dto);
    source.endpoints = source.endpoints
        .map(endpoint => withSupabaseRpcOutput(endpoint, rpcOutputShapes))
        .map(endpoint => withSupabaseSchemaHeaders(endpoint, schema))
        .map(endpoint => withSupabaseHeaders(endpoint, secretRef));

    const errors = validateSource(source);
    if (errors.length) {
        throw new InvalidParam("supabase", `imported source is invalid: ${errors.join("; ")}`);
    }

    return { source, secrets: [{ key: secretKey, value: dto.apiKey }] };
}

function normalizeSupabaseRestUrl(raw: string): string {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new InvalidParam("projectUrl", "must be an absolute URL");
    }
    const restIndex = url.pathname.indexOf("/rest/v1");
    url.pathname = restIndex >= 0
        ? `${url.pathname.slice(0, restIndex)}/rest/v1/`
        : "/rest/v1/";
    url.search = "";
    url.hash = "";
    return url.toString();
}

async function fetchSupabaseOpenApi(restUrl: string, apiKey: string, schema: string): Promise<string> {
    const response = await fetch(restUrl, {
        headers: {
            accept: "application/openapi+json",
            "accept-profile": schema,
            apikey: apiKey,
            authorization: `Bearer ${apiKey}`,
        },
    });
    if (!response.ok) {
        throw new InvalidParam("projectUrl", `Supabase OpenAPI request failed with HTTP ${response.status}`);
    }
    const spec = await response.text();
    if (!spec.trim()) throw new InvalidParam("projectUrl", "Supabase OpenAPI response was empty");
    return spec;
}

async function fetchSupabaseRpcOutputShapes(restUrl: string, apiKey: string, schema: string): Promise<Map<string, DataShape>> {
    let response: Response;
    try {
        response = await fetch(new URL(`rpc/${RPC_OUTPUT_METADATA_FUNCTION}`, restUrl).toString(), {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "content-profile": schema,
                apikey: apiKey,
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ p_schemas: [schema] }),
        });
    } catch {
        return new Map();
    }
    if (!response.ok) return new Map();

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return new Map();
    }
    return rpcOutputShapesFromMetadata(body);
}

function rpcOutputShapesFromMetadata(body: unknown): Map<string, DataShape> {
    const out = new Map<string, DataShape>();
    if (!isRecord(body) || !Array.isArray(body.functions)) return out;

    for (const entry of body.functions) {
        if (!isRecord(entry)) continue;
        const name = text(entry.name);
        if (!name || name === RPC_OUTPUT_METADATA_FUNCTION) continue;

        const shape = shapeFromFunctionMetadata(entry);
        if (!shape) continue;
        try {
            out.set(name, parseDataShape(shape, `supabase.functions.${name}.output`));
        } catch {
            continue;
        }
    }
    return out;
}

function shapeFromFunctionMetadata(entry: Record<string, unknown>): DataShape | null {
    const fields = fieldsShape(entry.fields);
    const returnShape = fields ?? shapeFromTypeMetadata(entry.returnType);
    if (!returnShape) return null;
    return entry.returnsSet === true ? { type: "array", items: returnShape } : returnShape;
}

function fieldsShape(fields: unknown): DataShape | null {
    if (!Array.isArray(fields) || fields.length === 0) return null;
    const properties: Record<string, DataShape> = {};
    for (const field of fields) {
        if (!isRecord(field)) continue;
        const name = text(field.name);
        if (!name || isUnsafePropertyName(name)) continue;
        const shape = shapeFromTypeMetadata(field);
        if (shape) properties[name] = shape;
    }
    return Object.keys(properties).length ? { type: "object", properties } : null;
}

function shapeFromTypeMetadata(value: unknown): DataShape | null {
    if (!isRecord(value)) return null;

    const fields = fieldsShape(value.fields);
    if (fields) return fields;

    const category = text(value.typeCategory);
    const kind = text(value.typeKind);
    const typeName = lowerText(value.typeName);
    const dataType = lowerText(value.dataType);

    if (category === "A") {
        return { type: "array", items: shapeFromTypeMetadata(value.element) ?? { type: "string" } };
    }
    if (category === "B" || typeName === "bool" || dataType === "boolean") return { type: "boolean" };
    if (category === "N" || isNumericType(typeName) || isNumericType(dataType)) return { type: "number" };
    if (typeName === "json" || typeName === "jsonb" || dataType === "json" || dataType === "jsonb") return { type: "object" };
    if (kind === "c") return { type: "object" };
    return { type: "string" };
}

function hasRpcEndpoints(source: Source): boolean {
    return source.endpoints.some(endpoint => rpcFunctionName(endpoint) !== null);
}

function withSupabaseRpcOutput(endpoint: SourceEndpoint, outputShapes: Map<string, DataShape>): SourceEndpoint {
    const name = rpcFunctionName(endpoint);
    if (!name) return endpoint;
    const body = outputShapes.get(name);
    if (!body) return endpoint;
    return { ...endpoint, output: mergeResponseOutput(endpoint.output, { status: "200", body }) };
}

function withSupabaseSchemaHeaders(endpoint: SourceEndpoint, schema: string): SourceEndpoint {
    if (schema === "public") return endpoint;
    const headers = (endpoint.headers ?? [])
        .filter(header => !["accept-profile", "content-profile"].includes(header.name.toLowerCase()));
    return {
        ...endpoint,
        headers: [
            ...headers,
            staticHeader("accept-profile", schema),
            staticHeader("content-profile", schema),
        ],
    };
}

function mergeResponseOutput(current: EndpointResponse[] | undefined, response: EndpointResponse): EndpointResponse[] {
    if (!current?.length) return [response];
    let replaced = false;
    const next = current.map(entry => {
        if (entry.status !== response.status || replaced) return entry;
        replaced = true;
        return response;
    });
    return replaced ? next : [response, ...next];
}

function rpcFunctionName(endpoint: SourceEndpoint): string | null {
    let url: URL;
    try {
        url = new URL(endpoint.targetUrl);
    } catch {
        return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const rpcIndex = segments.lastIndexOf("rpc");
    if (rpcIndex < 0) return null;
    const name = segments[rpcIndex + 1];
    return name ? decodeURIComponent(name) : null;
}

function mergeMeta(source: Source, dto: SupabaseOfficialProviderImportDto): Source["meta"] {
    const current = source.meta ?? { name: dto.id };
    return {
        ...current,
        ...(dto.meta?.name ? { name: dto.meta.name } : {}),
        ...(dto.meta?.description ? { description: dto.meta.description } : {}),
        ...(dto.meta?.icon ? { icon: dto.meta.icon } : {}),
    };
}

function withSupabaseHeaders(endpoint: SourceEndpoint, secretRef: string): SourceEndpoint {
    const headers = (endpoint.headers ?? [])
        .filter(header => !["apikey", "authorization"].includes(header.name.toLowerCase()));
    return {
        ...endpoint,
        headers: [
            ...headers,
            secretHeader("apikey", secretRef),
            secretHeader("authorization", secretRef, "Bearer "),
        ],
    };
}

function secretHeader(name: string, ref: string, prefix?: string): EndpointHeader {
    return { name, source: { from: "secret", ref, ...(prefix ? { prefix } : {}) } };
}

function staticHeader(name: string, value: string): EndpointHeader {
    return { name, source: { from: "static", value } };
}

function supabaseSecretKey(providerId: string): string {
    return `SUPABASE_${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function lowerText(value: unknown): string {
    return text(value)?.toLowerCase() ?? "";
}

function isUnsafePropertyName(value: string): boolean {
    return value === "__proto__" || value === "constructor" || value === "prototype";
}

function isNumericType(value: string): boolean {
    return [
        "bigint",
        "bigserial",
        "decimal",
        "double precision",
        "float4",
        "float8",
        "int2",
        "int4",
        "int8",
        "integer",
        "money",
        "numeric",
        "real",
        "serial",
        "smallint",
    ].includes(value);
}
