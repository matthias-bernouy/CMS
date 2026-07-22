import { handleSourceRequest, type SourceRepository } from "@bernouy/cms-sources";
import { sourcePrefix, type JsonRecord } from "../runtime.ts";

export async function tracking(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    expeditionNumber: string,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/tracking`);
    url.searchParams.set("expeditionNumber", expeditionNumber);
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

export async function saveRelaySelection(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}delivery/saveRelaySelection`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

export async function relaySelection(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    externalOrderId: string,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/relaySelection`);
    url.searchParams.set("externalOrderId", externalOrderId);
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

export async function setSettings(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}delivery/setSettings?id=default`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}
