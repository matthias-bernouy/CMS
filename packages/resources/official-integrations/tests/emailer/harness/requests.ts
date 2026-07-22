import { handleSourceRequest, type SourceRepository } from "@bernouy/cms-sources";
import type { Harness } from "./create";
import { sourcePrefix } from "./runtime";

export async function sourceRequest(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}emailer/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
        },
    });
}

export async function sourceJson(
    harness: Harness,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`${sourcePrefix}emailer/${endpoint}`, "https://cms.test");
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(
        harness.sources,
        new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
            },
        },
    );
}
