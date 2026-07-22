import { expect } from "bun:test";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

export function structuredEndpoint(): SourceEndpoint {
    return {
        urn: "urn:items:getItem",
        method: "GET",
        targetUrl: "https://api.example.com/items/1",
        output: [
            {
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        owner: { type: "object", properties: { name: { type: "string" } } },
                        items: {
                            type: "array",
                            items: { type: "object", properties: { id: { type: "string" } } },
                        },
                        providerData: { type: "object" },
                    },
                    required: ["id"],
                },
            },
        ],
    };
}

export async function expectGenericUpstreamFailure(response: Response): Promise<void> {
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const correlationId = response.headers.get("x-correlation-id");
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
}
