import type { GatewayResponseEffect } from "cms-gateway/protocol/TrustedCapabilityEffects";
import type { ResourceMetadata } from "cms-gateway/invocation/resource/metadata";

export interface ProviderJsonRepresentation {
    readonly contentLanguage: string;
}

/** A canonical language tag affects representation only; arbitrary response headers remain host-owned. */
function jsonRepresentation(value: ProviderJsonRepresentation): ProviderJsonRepresentation {
    if (
        !value ||
        typeof value !== "object" ||
        Object.keys(value).length !== 1 ||
        !Object.hasOwn(value, "contentLanguage") ||
        typeof value.contentLanguage !== "string" ||
        value.contentLanguage.length > 64
    ) {
        throw new TypeError("Invalid JSON representation metadata");
    }
    const language = Intl.getCanonicalLocales(value.contentLanguage)[0];
    if (!language) {
        throw new TypeError("Invalid JSON representation language");
    }
    return Object.freeze({ contentLanguage: language });
}

export class ProviderCapabilityResponse<Output = unknown> {
    readonly representation?: ProviderJsonRepresentation;
    constructor(
        readonly output: Output,
        readonly responseEffect?: GatewayResponseEffect,
        representation?: ProviderJsonRepresentation,
    ) {
        this.representation = representation === undefined ? undefined : jsonRepresentation(representation);
    }
}

export function capabilityResponse<const Output>(
    output: Output,
    responseEffect?: GatewayResponseEffect,
    representation?: ProviderJsonRepresentation,
): ProviderCapabilityResponse<Output> {
    return new ProviderCapabilityResponse(output, responseEffect, representation);
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
