import {
    executeEndpoint,
    makeEndpointUrn,
    type ExecutorDeps,
    type SourceEndpoint,
    type SourceRepository,
} from "@bernouy/cms-sources";

export async function sourceEndpoint(
    sources: SourceRepository,
    sourceId: string,
    endpointId: string,
): Promise<SourceEndpoint | null> {
    return await sources.getEndpoint(makeEndpointUrn(sourceId, endpointId));
}

export async function callJson(
    endpoint: SourceEndpoint,
    body: Record<string, unknown>,
    deps: ExecutorDeps,
): Promise<Record<string, unknown>> {
    const hasBody = endpoint.method !== "GET" && endpoint.method !== "HEAD";
    const response = await executeEndpoint(
        endpoint,
        new Request("https://cms.internal/notification-worker", {
            method: endpoint.method,
            ...(hasBody
                ? {
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify(body),
                  }
                : {}),
        }),
        deps,
    );
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
        throw new Error(responseError(payload, response.status));
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error(`notification endpoint returned invalid JSON (${response.status})`);
    }
    return payload as Record<string, unknown>;
}

function responseError(payload: unknown, status: number): string {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        const message = (payload as Record<string, unknown>).error;
        if (typeof message === "string" && message) {
            return message;
        }
    }
    return `notification endpoint failed with ${status}`;
}
