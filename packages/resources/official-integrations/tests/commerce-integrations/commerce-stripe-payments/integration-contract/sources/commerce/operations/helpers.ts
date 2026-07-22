import { makeEndpointUrn } from "@bernouy/cms-sources";

export const commerceQuery = (endpointId: string, params: string[] = []) => ({
    urn: makeEndpointUrn("commerce", endpointId),
    method: "GET" as const,
    targetUrl: `https://commerce.test/${endpointId}`,
    input: { params: params.map((name) => ({ name, in: "query" as const, schema: { type: "string" as const } })) },
    output: [{ status: "200", body: { type: "object" as const } }],
});

export const commerceCommand = (
    endpointId: string,
    properties: Record<string, { type: "string" | "number" | "object" }>,
) => ({
    urn: makeEndpointUrn("commerce", endpointId),
    method: "POST" as const,
    targetUrl: `https://commerce.test/${endpointId}`,
    input: { body: { type: "object" as const, properties } },
    output: [{ status: "200", body: { type: "object" as const } }],
});
