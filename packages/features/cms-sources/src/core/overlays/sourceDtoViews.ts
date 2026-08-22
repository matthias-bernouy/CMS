import type { CanonicalSourceDto, SourceDto, SourceEndpointDto, SourceFlatDto } from "./sourceDtoTypes";

export function flattenSourceDto(dto: SourceDto): SourceFlatDto {
    const flat: SourceFlatDto = { id: dto.id };
    assignMeta(flat, dto);
    assignOptional(flat, "indexing", dto.indexing, JSON.stringify);
    dto.endpoints.forEach((endpoint, index) => assignEndpoint(flat, endpoint, index));
    return flat;
}

export function canonicalizeSourceDto(dto: SourceDto): CanonicalSourceDto {
    return {
        id: dto.id,
        meta: {
            name: dto.meta.name ?? "",
            description: dto.meta.description ?? "",
            icon: dto.meta.icon ?? "",
            svg: dto.meta.svg ?? "",
        },
        indexing: dto.indexing ?? null,
        endpoints: dto.endpoints.map((endpoint) => ({
            endpointId: endpoint.endpointId,
            method: endpoint.method,
            targetUrl: endpoint.targetUrl,
            ...(endpoint.timeoutMs !== undefined ? { timeoutMs: endpoint.timeoutMs } : {}),
            ...(endpoint.access !== undefined ? { access: endpoint.access } : {}),
            ...(endpoint.effects !== undefined ? { effects: endpoint.effects } : {}),
            responseKind: endpoint.responseKind ?? "json",
            mediaType: endpoint.mediaType ?? "",
            params: endpoint.params.map((param) => ({
                name: param.name,
                in: param.in,
                type: param.type ?? "string",
                ...(param.semantic ? { semantic: param.semantic } : {}),
                required: !!param.required,
                description: param.description ?? "",
                source: param.source ?? { from: "request" },
            })),
            body: endpoint.body ?? null,
            output: endpoint.output ?? null,
            meta: endpoint.meta ?? null,
            headers: endpoint.headers ?? null,
        })),
    };
}

function assignMeta(flat: SourceFlatDto, dto: SourceDto): void {
    flat["meta.name"] = dto.meta.name;
    if (dto.meta.description !== undefined) {
        flat["meta.description"] = dto.meta.description;
    }
    if (dto.meta.icon !== undefined) {
        flat["meta.icon"] = dto.meta.icon;
    }
    if (dto.meta.svg !== undefined) {
        flat["meta.svg"] = dto.meta.svg;
    }
}

function assignEndpoint(flat: SourceFlatDto, endpoint: SourceEndpointDto, index: number): void {
    const prefix = `endpoints.${index}`;
    flat[`${prefix}.endpointId`] = endpoint.endpointId;
    flat[`${prefix}.method`] = endpoint.method;
    flat[`${prefix}.targetUrl`] = endpoint.targetUrl;
    assignOptional(flat, `${prefix}.timeoutMs`, endpoint.timeoutMs, String);
    assignOptional(flat, `${prefix}.access`, endpoint.access, JSON.stringify);
    assignOptional(flat, `${prefix}.effects`, endpoint.effects, JSON.stringify);
    assignOptional(flat, `${prefix}.responseKind`, endpoint.responseKind, String);
    assignOptional(flat, `${prefix}.mediaType`, endpoint.mediaType, String);
    if (endpoint.params.length) {
        flat[`${prefix}.params`] = JSON.stringify(endpoint.params);
    }
    assignOptional(flat, `${prefix}.body`, endpoint.body, JSON.stringify);
    assignOptional(flat, `${prefix}.output`, endpoint.output, JSON.stringify);
    assignOptional(flat, `${prefix}.meta`, endpoint.meta, JSON.stringify);
    assignOptional(flat, `${prefix}.headers`, endpoint.headers, JSON.stringify);
}

function assignOptional(flat: SourceFlatDto, key: string, value: unknown, serialize: (value: never) => string): void {
    if (value !== undefined) {
        flat[key] = serialize(value as never);
    }
}
