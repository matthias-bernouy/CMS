import { handleSourceRequest, type SourceRepository } from "@bernouy/cms-sources";
import { sourcePrefix, type JsonRecord } from "../runtime.ts";

export async function relayPoints(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    params: Record<string, string>,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/relayPoints`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
            responseProjectionMode: "strict",
        },
    });
}

export async function createShipment(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}delivery/createShipment`, {
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
                responseProjectionMode: "strict",
            },
        },
    );
}
