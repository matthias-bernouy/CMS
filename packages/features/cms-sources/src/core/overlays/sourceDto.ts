import type { SourceEndpoint, EndpointParam, Source } from "cms-sources/interfaces/Source";
import type { DataShape } from "cms-sources/interfaces/DataShape";
import type { CanonicalSourceDto, SourceDto, SourceEndpointDto, SourceFlatDto } from "./sourceDtoTypes";
import { makeEndpointUrn, makeSourceUrn, parseUrn } from "cms-sources/core/system/urn";
import { canonicalizeSourceDto, flattenSourceDto } from "./sourceDtoViews";
export type {
    CanonicalSourceDto,
    CanonicalSourceEndpointDto,
    SourceDto,
    SourceEndpointDto,
    SourceFlatDto,
    SourceParamDto,
} from "./sourceDtoTypes";

export function sourceDtoToSource(dto: SourceDto): Source {
    const authority = dto.identityAuthority ?? dto.id;
    return {
        urn: makeSourceUrn(dto.id),
        identityAuthority: authority,
        meta: dto.meta,
        endpoints: dto.endpoints.map((e) => endpointDtoToEndpoint(dto.id, e, authority)),
    };
}

export function sourceToDto(source: Source): SourceDto {
    const id = parseUrn(source.urn)?.source ?? "";
    return {
        id,
        ...(source.identityAuthority ? { identityAuthority: source.identityAuthority } : {}),
        meta: source.meta ?? { name: id },
        endpoints: source.endpoints.map((e) => endpointToDto(e)),
    };
}

export function sourceToFlatDto(source: Source): SourceFlatDto {
    return flattenSourceDto(sourceToDto(source));
}

export function sourceToCanonicalDto(source: Source): CanonicalSourceDto {
    return canonicalizeSourceDto(sourceToDto(source));
}

function endpointDtoToEndpoint(sourceId: string, e: SourceEndpointDto, authority: string): SourceEndpoint {
    const params: EndpointParam[] = e.params.map((p) => ({
        name: p.name,
        in: p.in,
        schema: qualifyIdentityAuthority(
            {
                type: p.type ?? "string",
                ...(p.semantic ? { semantic: p.semantic } : {}),
            },
            authority,
        ),
        ...(p.required !== undefined ? { required: p.required } : {}),
        ...(p.description ? { description: p.description } : {}),
        ...(p.source ? { source: p.source } : {}),
    }));
    const endpoint: SourceEndpoint = {
        urn: makeEndpointUrn(sourceId, e.endpointId),
        method: e.method,
        targetUrl: e.targetUrl,
    };
    if (e.timeoutMs !== undefined) {
        endpoint.timeoutMs = e.timeoutMs;
    }
    if (e.access !== undefined) {
        endpoint.access = e.access;
    }
    if (e.effects !== undefined) {
        endpoint.effects = e.effects;
    }
    if (e.responseKind !== undefined) {
        endpoint.responseKind = e.responseKind;
    }
    if (e.mediaType !== undefined) {
        endpoint.mediaType = e.mediaType;
    }
    if (params.length || e.body) {
        endpoint.input = {};
        if (params.length) {
            endpoint.input.params = params;
        }
        if (e.body) {
            endpoint.input.body = qualifyIdentityAuthority(e.body, authority);
        }
    }
    if (e.output?.length) {
        endpoint.output = e.output.map((output) => ({
            ...output,
            ...(output.body ? { body: qualifyIdentityAuthority(output.body, authority) } : {}),
            ...(output.triggerBody
                ? {
                      triggerBody: qualifyIdentityAuthority(output.triggerBody, authority),
                  }
                : {}),
        }));
    }
    if (e.meta) {
        endpoint.meta = e.meta;
    }
    if (e.headers?.length) {
        endpoint.headers = e.headers;
    }
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
        params: (endpoint.input?.params ?? []).map((p) => ({
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
        ...(semantic
            ? {
                  semantic: { ...semantic, authority: semantic.authority ?? authority },
              }
            : {}),
        ...(shape.properties
            ? {
                  properties: Object.fromEntries(
                      Object.entries(shape.properties).map(([name, child]) => [
                          name,
                          qualifyIdentityAuthority(child, authority),
                      ]),
                  ),
              }
            : {}),
        ...(shape.items ? { items: qualifyIdentityAuthority(shape.items, authority) } : {}),
    };
}
