import type { GatewayResponseEffect } from "cms-gateway/protocol/TrustedCapabilityEffects";
import type { ResourceMetadata } from "cms-gateway/invocation/resource/metadata";

export class ProviderCapabilityResponse {
    constructor(
        readonly output: unknown,
        readonly responseEffect?: GatewayResponseEffect,
    ) {}
}

export function capabilityResponse(
    output: unknown,
    responseEffect?: GatewayResponseEffect,
): ProviderCapabilityResponse {
    return new ProviderCapabilityResponse(output, responseEffect);
}

export interface ProviderBinaryResult {
    readonly resource?: ResourceMetadata;
    readonly kind: "binary";
    readonly stream: ReadableStream<Uint8Array>;
    readonly contentType: string;
    readonly status?: number;
    readonly contentLength?: number;
    readonly headers?: Readonly<Record<string, string>>;
}

/** Optional cache dependencies around a standard resource Response. */
export class ProviderResourceResponse {
    constructor(
        readonly response: Response,
        readonly metadata: { readonly vary?: readonly string[]; readonly cacheTags?: readonly string[] } = {},
    ) {}
}
export function resourceResponse(
    response: Response,
    metadata: ProviderResourceResponse["metadata"] = {},
): ProviderResourceResponse {
    return new ProviderResourceResponse(response, metadata);
}
