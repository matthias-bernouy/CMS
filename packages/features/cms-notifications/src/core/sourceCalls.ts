import {
    executeEndpoint,
    makeEndpointUrn,
    parseUrn,
    type ExecutorDeps,
    type SourceEndpoint,
    type SourceRepository,
} from "@bernouy/cms-sources";
import type { IntegrationInstallation, IntegrationInstallationRepository } from "@bernouy/cms-integrations";

export async function installedEndpoint(
    installations: IntegrationInstallationRepository,
    sources: SourceRepository,
    kind: string,
    endpointId: string,
): Promise<SourceEndpoint | null> {
    const installation = await installations.get(kind);
    if (!installation || installation.status !== "success") {
        return null;
    }
    for (const sourceId of installedSourceIds(installation)) {
        const endpoint = await sources.getEndpoint(makeEndpointUrn(sourceId, endpointId));
        if (endpoint) {
            return endpoint;
        }
    }
    return null;
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

function installedSourceIds(installation: IntegrationInstallation): string[] {
    return installation.artifacts
        .filter((artifact) => artifact.type === "source")
        .map((artifact) => parseUrn(artifact.id)?.source)
        .filter((sourceId): sourceId is string => !!sourceId);
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
