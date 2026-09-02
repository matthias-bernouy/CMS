import type { IdentityService } from "@bernouy/cms-identities";
import { handleSourceRequest, type SourceRepository } from "@bernouy/cms-sources";
import { sourcePrefix } from "./constants";

export type SourceRequestHarness = {
    sources: SourceRepository;
    sourceFetch: typeof fetch;
    resolveSecret(ref: string): Promise<string | undefined>;
    identities: IdentityService;
};

export async function sourceRequest(
    harness: SourceRequestHarness,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceRequestWithUser(harness, "user-123", endpoint, params);
}

export async function sourceRequestWithUser(
    harness: SourceRequestHarness,
    userId: string,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceRequestWithRole(harness, userId, "admin", endpoint, params);
}

export async function sourceRequestWithRole(
    harness: SourceRequestHarness,
    userId: string,
    role: string | undefined,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}stripe-connect/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(harness, userId, role, new Request(url));
}

export async function sourceJson(
    harness: SourceRequestHarness,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceJsonWithUser(harness, "user-123", endpoint, body, params);
}

export async function sourceJsonWithUser(
    harness: SourceRequestHarness,
    userId: string,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    return await sourceJsonWithRole(harness, userId, "admin", endpoint, body, params);
}

export async function sourceJsonWithRole(
    harness: SourceRequestHarness,
    userId: string,
    role: string | undefined,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}stripe-connect/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(
        harness,
        userId,
        role,
        new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

async function proxySource(
    harness: SourceRequestHarness,
    userId: string,
    role: string | undefined,
    request: Request,
): Promise<Response> {
    return await handleSourceRequest(harness.sources, request, {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: userId, ...(role ? { userRole: role } : {}) }),
            identities: harness.identities,
        },
    });
}
