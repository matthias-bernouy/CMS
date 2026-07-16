import type {
    SourceEndpoint,
    EndpointParam,
    Source,
} from "../interfaces/Source";
import type { DataShape } from "../interfaces/DataShape";
import type { CanonicalSourceDto, SourceDto, SourceEndpointDto, SourceFlatDto } from "./sourceDtoTypes";
import { makeEndpointUrn, makeSourceUrn, parseUrn } from "./urn";
export type { CanonicalSourceDto, CanonicalSourceEndpointDto, SourceDto, SourceEndpointDto, SourceFlatDto, SourceParamDto } from "./sourceDtoTypes";

export function sourceDtoToSource(dto: SourceDto): Source {
    const authority = dto.identityAuthority ?? dto.id;
    return {
        urn: makeSourceUrn(dto.id),
        identityAuthority: authority,
        meta: dto.meta,
        endpoints: dto.endpoints.map(e => endpointDtoToEndpoint(dto.id, e, authority)),
    };
}

export function sourceToDto(source: Source): SourceDto {
    const id = parseUrn(source.urn)?.source ?? "";
    return {
        id,
        ...(source.identityAuthority ? { identityAuthority: source.identityAuthority } : {}),
        meta: source.meta ?? { name: id },
        endpoints: source.endpoints.map(e => endpointToDto(e)),
    };
}

export function sourceToFlatDto(source: Source): SourceFlatDto {
    const dto = sourceToDto(source);
    const flat: SourceFlatDto = { id: dto.id };
    assignMeta(flat, dto);
    dto.endpoints.forEach((e, i) => {
        assignEndpoint(flat, e, i);
    });
    return flat;
}

export function sourceToCanonicalDto(source: Source): CanonicalSourceDto {
    const dto = sourceToDto(source);
    return {
        id: dto.id,
        meta: {
            name: dto.meta.name ?? "",
            description: dto.meta.description ?? "",
            icon: dto.meta.icon ?? "",
            svg: dto.meta.svg ?? "",
        },
        endpoints: dto.endpoints.map(e => ({
            endpointId: e.endpointId,
            method: e.method,
            targetUrl: e.targetUrl,
            ...(e.timeoutMs !== undefined ? { timeoutMs: e.timeoutMs } : {}),
            ...(e.access !== undefined ? { access: e.access } : {}),
            ...(e.effects !== undefined ? { effects: e.effects } : {}),
            responseKind: e.responseKind ?? "json",
            mediaType: e.mediaType ?? "",
            params: e.params.map(p => ({
                name: p.name,
                in: p.in,
                type: p.type ?? "string",
                ...(p.semantic ? { semantic: p.semantic } : {}),
                required: !!p.required,
                description: p.description ?? "",
                source: p.source ?? { from: "request" },
            })),
            body: e.body ?? null,
            output: e.output ?? null,
            meta: e.meta ?? null,
            headers: e.headers ?? null,
        })),
    };
}

function endpointDtoToEndpoint(sourceId: string, e: SourceEndpointDto, authority: string): SourceEndpoint {
    const params: EndpointParam[] = e.params.map(p => ({
        name: p.name,
        in: p.in,
        schema: qualifyIdentityAuthority({
            type: p.type ?? "string",
            ...(p.semantic ? { semantic: p.semantic } : {}),
        }, authority),
        ...(p.required !== undefined ? { required: p.required } : {}),
        ...(p.description ? { description: p.description } : {}),
        ...(p.source ? { source: p.source } : {}),
    }));
    const endpoint: SourceEndpoint = {
        urn: makeEndpointUrn(sourceId, e.endpointId),
        method: e.method,
        targetUrl: e.targetUrl,
    };
    if (e.timeoutMs !== undefined) endpoint.timeoutMs = e.timeoutMs;
    if (e.access !== undefined) endpoint.access = e.access;
    if (e.effects !== undefined) endpoint.effects = e.effects;
    if (e.responseKind !== undefined) endpoint.responseKind = e.responseKind;
    if (e.mediaType !== undefined) endpoint.mediaType = e.mediaType;
    if (params.length || e.body) {
        endpoint.input = {};
        if (params.length) endpoint.input.params = params;
        if (e.body) endpoint.input.body = qualifyIdentityAuthority(e.body, authority);
    }
    if (e.output?.length) endpoint.output = e.output.map(output => ({
        ...output,
        ...(output.body ? { body: qualifyIdentityAuthority(output.body, authority) } : {}),
    }));
    if (e.meta) endpoint.meta = e.meta;
    if (e.headers?.length) endpoint.headers = e.headers;
    return endpoint;
}

function endpointToDto(endpoint: SourceEndpoint): SourceEndpointDto {
    return {
        endpointId: parseUrn(endpoint.urn)?.endpoint ?? "",
        method: endpoint.method,
        targetUrl: endpoint.targetUrl,
        ...(endpoint.timeoutMs !== undefined ? { timeoutMs: endpoint.timeoutMs } : {}),
        ...(endpoint.access !== undefined ? { access: endpoint.access } : {}),
        ...(endpoint.effects !== undefined ? { effects: endpoint.effects } : {}),
        ...(endpoint.responseKind !== undefined ? { responseKind: endpoint.responseKind } : {}),
        ...(endpoint.mediaType !== undefined ? { mediaType: endpoint.mediaType } : {}),
        params: (endpoint.input?.params ?? []).map(p => ({
            name: p.name,
            in: p.in,
            type: p.schema?.type ?? "string",
            ...(p.schema?.semantic ? { semantic: p.schema.semantic } : {}),
            required: !!p.required,
            ...(p.description ? { description: p.description } : {}),
            ...(p.source ? { source: p.source } : {}),
        })),
        ...(endpoint.input?.body ? { body: endpoint.input.body } : {}),
        ...(endpoint.output?.length ? { output: endpoint.output } : {}),
        ...(endpoint.meta ? { meta: endpoint.meta } : {}),
        ...(endpoint.headers?.length ? { headers: endpoint.headers } : {}),
    };
}

function qualifyIdentityAuthority(shape: DataShape, authority: string): DataShape {
    const rawSemantic = shape.semantic as DataShape["semantic"] | "user-id" | undefined;
    const semantic = rawSemantic === "user-id" ? { kind: "user-id" as const } : rawSemantic;
    return {
        ...shape,
        ...(semantic ? {
            semantic: { ...semantic, authority: semantic.authority ?? authority },
        } : {}),
        ...(shape.properties ? {
            properties: Object.fromEntries(Object.entries(shape.properties)
                .map(([name, child]) => [name, qualifyIdentityAuthority(child, authority)])),
        } : {}),
        ...(shape.items ? { items: qualifyIdentityAuthority(shape.items, authority) } : {}),
    };
}

function assignMeta(flat: SourceFlatDto, dto: SourceDto): void {
    flat["meta.name"] = dto.meta.name;
    if (dto.meta.description !== undefined) flat["meta.description"] = dto.meta.description;
    if (dto.meta.icon !== undefined)        flat["meta.icon"]        = dto.meta.icon;
    if (dto.meta.svg !== undefined)         flat["meta.svg"]         = dto.meta.svg;
}

function assignEndpoint(flat: SourceFlatDto, endpoint: SourceEndpointDto, index: number): void {
    const prefix = `endpoints.${index}`;
    flat[`${prefix}.endpointId`] = endpoint.endpointId;
    flat[`${prefix}.method`] = endpoint.method;
    flat[`${prefix}.targetUrl`] = endpoint.targetUrl;
    if (endpoint.timeoutMs !== undefined) flat[`${prefix}.timeoutMs`] = String(endpoint.timeoutMs);
    if (endpoint.access !== undefined) flat[`${prefix}.access`] = JSON.stringify(endpoint.access);
    if (endpoint.effects !== undefined) flat[`${prefix}.effects`] = JSON.stringify(endpoint.effects);
    if (endpoint.responseKind !== undefined) flat[`${prefix}.responseKind`] = endpoint.responseKind;
    if (endpoint.mediaType !== undefined) flat[`${prefix}.mediaType`] = endpoint.mediaType;
    if (endpoint.params.length) flat[`${prefix}.params`] = JSON.stringify(endpoint.params);
    if (endpoint.body !== undefined) flat[`${prefix}.body`] = JSON.stringify(endpoint.body);
    if (endpoint.output !== undefined) flat[`${prefix}.output`] = JSON.stringify(endpoint.output);
    if (endpoint.meta !== undefined) flat[`${prefix}.meta`] = JSON.stringify(endpoint.meta);
    if (endpoint.headers !== undefined) flat[`${prefix}.headers`] = JSON.stringify(endpoint.headers);
}
