import type { SourceEndpoint } from "@bernouy/cms-sources";

export function buildFunctionCallRequest(
    endpoint: SourceEndpoint,
    mappings: { params: Record<string, unknown>; body: unknown },
): Request {
    const url = new URL("https://cms.function/internal");
    for (const [key, value] of Object.entries(mappings.params)) {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    }
    const body = mappings.body;
    return new Request(url, {
        method: endpoint.method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
