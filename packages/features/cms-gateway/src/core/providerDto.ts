import type {
    Endpoint,
    EndpointHeader,
    EndpointParam,
    EndpointResponse,
    GatewayMeta,
    HTTPMethod,
    ParamIn,
    ParamValueSource,
    Provider,
} from "../interfaces/Gateway";
import type { DataShape } from "../interfaces/DataShape";
import { makeEndpointUrn, makeProviderUrn, parseUrn } from "./urn";

export type ProviderParamDto = {
    name: string;
    in: ParamIn;
    type?: DataShape["type"];
    required?: boolean;
    description?: string;
    source?: ParamValueSource;
};

export type EndpointDto = {
    endpointId: string;
    method: HTTPMethod;
    targetUrl: string;
    params: ProviderParamDto[];
    body?: DataShape;
    output?: EndpointResponse[];
    meta?: GatewayMeta;
    headers?: EndpointHeader[];
};

export type ProviderDto = {
    id: string;
    meta: GatewayMeta;
    endpoints: EndpointDto[];
};

export type ProviderFlatDto = Record<string, string>;
export type CanonicalEndpointDto = Omit<EndpointDto, "body" | "output" | "meta" | "headers"> & {
        body: DataShape | null;
        output: EndpointResponse[] | null;
        meta: GatewayMeta | null;
        headers: EndpointHeader[] | null;
};
export type CanonicalProviderDto = Omit<ProviderDto, "endpoints"> & {
    endpoints: CanonicalEndpointDto[];
};

export function providerDtoToProvider(dto: ProviderDto): Provider {
    return {
        urn: makeProviderUrn(dto.id),
        meta: dto.meta,
        endpoints: dto.endpoints.map(e => endpointDtoToEndpoint(dto.id, e)),
    };
}

export function providerToDto(provider: Provider): ProviderDto {
    const id = parseUrn(provider.urn)?.provider ?? "";
    return {
        id,
        meta: provider.meta ?? { name: id },
        endpoints: provider.endpoints.map(e => endpointToDto(e)),
    };
}

export function providerToFlatDto(provider: Provider): ProviderFlatDto {
    const dto = providerToDto(provider);
    const flat: ProviderFlatDto = { id: dto.id };
    flat["meta.name"] = dto.meta.name;
    if (dto.meta.description !== undefined) flat["meta.description"] = dto.meta.description;
    if (dto.meta.icon !== undefined)        flat["meta.icon"]        = dto.meta.icon;

    dto.endpoints.forEach((e, i) => {
        flat[`endpoints.${i}.endpointId`] = e.endpointId;
        flat[`endpoints.${i}.method`]     = e.method;
        flat[`endpoints.${i}.targetUrl`]  = e.targetUrl;
        if (e.params.length)    flat[`endpoints.${i}.params`]  = JSON.stringify(e.params);
        if (e.body !== undefined)    flat[`endpoints.${i}.body`]    = JSON.stringify(e.body);
        if (e.output !== undefined)  flat[`endpoints.${i}.output`]  = JSON.stringify(e.output);
        if (e.meta !== undefined)    flat[`endpoints.${i}.meta`]    = JSON.stringify(e.meta);
        if (e.headers !== undefined) flat[`endpoints.${i}.headers`] = JSON.stringify(e.headers);
    });
    return flat;
}

export function providerToCanonicalDto(provider: Provider): CanonicalProviderDto {
    const dto = providerToDto(provider);
    return {
        id: dto.id,
        meta: {
            name: dto.meta.name ?? "",
            description: dto.meta.description ?? "",
            icon: dto.meta.icon ?? "",
        },
        endpoints: dto.endpoints.map(e => ({
            endpointId: e.endpointId,
            method: e.method,
            targetUrl: e.targetUrl,
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

function endpointDtoToEndpoint(providerId: string, e: EndpointDto): Endpoint {
    const params: EndpointParam[] = e.params.map(p => ({
        name: p.name,
        in: p.in,
        schema: { type: p.type ?? "string" },
        ...(p.required !== undefined ? { required: p.required } : {}),
        ...(p.description ? { description: p.description } : {}),
        ...(p.source ? { source: p.source } : {}),
    }));
    const endpoint: Endpoint = {
        urn: makeEndpointUrn(providerId, e.endpointId),
        method: e.method,
        targetUrl: e.targetUrl,
    };
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

function endpointToDto(endpoint: Endpoint): EndpointDto {
    return {
        endpointId: parseUrn(endpoint.urn)?.endpoint ?? "",
        method: endpoint.method,
        targetUrl: endpoint.targetUrl,
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
