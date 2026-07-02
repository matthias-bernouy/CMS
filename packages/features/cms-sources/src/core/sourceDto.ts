import type {
    SourceEndpoint,
    EndpointHeader,
    EndpointParam,
    EndpointResponse,
    SourceMeta,
    HTTPMethod,
    ParamIn,
    ParamValueSource,
    Source,
    ResponseKind,
} from "../interfaces/Source";
import type { DataShape } from "../interfaces/DataShape";
import { makeEndpointUrn, makeSourceUrn, parseUrn } from "./urn";

export type SourceParamDto = {
    name: string;
    in: ParamIn;
    type?: DataShape["type"];
    required?: boolean;
    description?: string;
    source?: ParamValueSource;
};

export type SourceEndpointDto = {
    endpointId: string;
    method: HTTPMethod;
    targetUrl: string;
    responseKind?: ResponseKind;
    mediaType?: string;
    params: SourceParamDto[];
    body?: DataShape;
    output?: EndpointResponse[];
    meta?: SourceMeta;
    headers?: EndpointHeader[];
};

export type SourceDto = {
    id: string;
    meta: SourceMeta;
    endpoints: SourceEndpointDto[];
};

export type SourceFlatDto = Record<string, string>;
export type CanonicalSourceEndpointDto = Omit<SourceEndpointDto, "body" | "output" | "meta" | "headers"> & {
        body: DataShape | null;
        output: EndpointResponse[] | null;
        meta: SourceMeta | null;
        headers: EndpointHeader[] | null;
};
export type CanonicalSourceDto = Omit<SourceDto, "endpoints"> & {
    endpoints: CanonicalSourceEndpointDto[];
};

export function sourceDtoToSource(dto: SourceDto): Source {
    return {
        urn: makeSourceUrn(dto.id),
        meta: dto.meta,
        endpoints: dto.endpoints.map(e => endpointDtoToEndpoint(dto.id, e)),
    };
}

export function sourceToDto(source: Source): SourceDto {
    const id = parseUrn(source.urn)?.source ?? "";
    return {
        id,
        meta: source.meta ?? { name: id },
        endpoints: source.endpoints.map(e => endpointToDto(e)),
    };
}

export function sourceToFlatDto(source: Source): SourceFlatDto {
    const dto = sourceToDto(source);
    const flat: SourceFlatDto = { id: dto.id };
    flat["meta.name"] = dto.meta.name;
    if (dto.meta.description !== undefined) flat["meta.description"] = dto.meta.description;
    if (dto.meta.icon !== undefined)        flat["meta.icon"]        = dto.meta.icon;
    if (dto.meta.svg !== undefined)         flat["meta.svg"]         = dto.meta.svg;

    dto.endpoints.forEach((e, i) => {
        flat[`endpoints.${i}.endpointId`] = e.endpointId;
        flat[`endpoints.${i}.method`]     = e.method;
        flat[`endpoints.${i}.targetUrl`]  = e.targetUrl;
        if (e.responseKind !== undefined) flat[`endpoints.${i}.responseKind`] = e.responseKind;
        if (e.mediaType !== undefined)    flat[`endpoints.${i}.mediaType`]    = e.mediaType;
        if (e.params.length)    flat[`endpoints.${i}.params`]  = JSON.stringify(e.params);
        if (e.body !== undefined)    flat[`endpoints.${i}.body`]    = JSON.stringify(e.body);
        if (e.output !== undefined)  flat[`endpoints.${i}.output`]  = JSON.stringify(e.output);
        if (e.meta !== undefined)    flat[`endpoints.${i}.meta`]    = JSON.stringify(e.meta);
        if (e.headers !== undefined) flat[`endpoints.${i}.headers`] = JSON.stringify(e.headers);
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
            responseKind: e.responseKind ?? "json",
            mediaType: e.mediaType ?? "",
            params: e.params.map(p => ({
                name: p.name,
                in: p.in,
                type: p.type ?? "string",
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

function endpointDtoToEndpoint(sourceId: string, e: SourceEndpointDto): SourceEndpoint {
    const params: EndpointParam[] = e.params.map(p => ({
        name: p.name,
        in: p.in,
        schema: { type: p.type ?? "string" },
        ...(p.required !== undefined ? { required: p.required } : {}),
        ...(p.description ? { description: p.description } : {}),
        ...(p.source ? { source: p.source } : {}),
    }));
    const endpoint: SourceEndpoint = {
        urn: makeEndpointUrn(sourceId, e.endpointId),
        method: e.method,
        targetUrl: e.targetUrl,
    };
    if (e.responseKind !== undefined) endpoint.responseKind = e.responseKind;
    if (e.mediaType !== undefined) endpoint.mediaType = e.mediaType;
    if (params.length || e.body) {
        endpoint.input = {};
        if (params.length) endpoint.input.params = params;
        if (e.body) endpoint.input.body = e.body;
    }
    if (e.output?.length) endpoint.output = e.output;
    if (e.meta) endpoint.meta = e.meta;
    if (e.headers?.length) endpoint.headers = e.headers;
    return endpoint;
}

function endpointToDto(endpoint: SourceEndpoint): SourceEndpointDto {
    return {
        endpointId: parseUrn(endpoint.urn)?.endpoint ?? "",
        method: endpoint.method,
        targetUrl: endpoint.targetUrl,
        ...(endpoint.responseKind !== undefined ? { responseKind: endpoint.responseKind } : {}),
        ...(endpoint.mediaType !== undefined ? { mediaType: endpoint.mediaType } : {}),
        params: (endpoint.input?.params ?? []).map(p => ({
            name: p.name,
            in: p.in,
            type: p.schema?.type ?? "string",
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
