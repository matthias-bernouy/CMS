import {
    openApiSpecToProvider,
    validateProvider,
    type Endpoint,
    type EndpointHeader,
    type Provider,
} from "@bernouy/cms-gateway";
import { secretKeyToRef } from "@bernouy/cms-secrets";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { SupabaseOfficialProviderImportDto } from "cms-control/core/validation/gateway/parseOfficialProviderImportDto";
import type { OfficialProviderImportResult } from "../types";

export async function importSupabaseOfficialProvider(
    dto: SupabaseOfficialProviderImportDto,
): Promise<OfficialProviderImportResult> {
    const restUrl = normalizeSupabaseRestUrl(dto.projectUrl);
    const secretKey = supabaseSecretKey(dto.id);
    const secretRef = secretKeyToRef(secretKey);
    const spec = await fetchSupabaseOpenApi(restUrl, dto.apiKey);
    const provider = openApiSpecToProvider(spec, {
        providerId: dto.id,
        baseUrl: restUrl.replace(/\/+$/, ""),
    });

    provider.meta = mergeMeta(provider, dto);
    provider.endpoints = provider.endpoints.map(endpoint => withSupabaseHeaders(endpoint, secretRef));

    const errors = validateProvider(provider);
    if (errors.length) {
        throw new InvalidParam("supabase", `imported provider is invalid: ${errors.join("; ")}`);
    }

    return { provider, secrets: [{ key: secretKey, value: dto.apiKey }] };
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

async function fetchSupabaseOpenApi(restUrl: string, apiKey: string): Promise<string> {
    const response = await fetch(restUrl, {
        headers: {
            accept: "application/openapi+json",
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

function mergeMeta(provider: Provider, dto: SupabaseOfficialProviderImportDto): Provider["meta"] {
    const current = provider.meta ?? { name: dto.id };
    return {
        ...current,
        ...(dto.meta?.name ? { name: dto.meta.name } : {}),
        ...(dto.meta?.description ? { description: dto.meta.description } : {}),
        ...(dto.meta?.icon ? { icon: dto.meta.icon } : {}),
    };
}

function withSupabaseHeaders(endpoint: Endpoint, secretRef: string): Endpoint {
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

function supabaseSecretKey(providerId: string): string {
    return `SUPABASE_${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}
