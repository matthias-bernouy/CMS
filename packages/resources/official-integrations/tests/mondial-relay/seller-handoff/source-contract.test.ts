import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const definitionUrl = new URL("../../../integrations/mondial-relay/versions/1.0.0/definition.json", import.meta.url);

describe("Mondial Relay seller handoff Source contract", () => {
    test("forwards the authenticated seller through a computed header", async () => {
        const endpoint = await handoffEndpoint();

        expect(endpoint).toMatchObject({
            method: "POST",
            access: "system",
            targetUrl: expect.stringContaining("/cms-delivery/system/shipments/handoff"),
            headers: [
                {
                    name: "authorization",
                    source: {
                        from: "secret",
                        ref: "{{secrets.cmsApiKey}}",
                        prefix: "Bearer ",
                    },
                },
                {
                    name: "x-cms-user-id",
                    source: { from: "computed", ref: "userID" },
                },
            ],
        });
        expect(endpoint.body).toEqual({
            type: "object",
            properties: { externalOrderId: { type: "string" } },
            required: ["externalOrderId"],
        });
    });

    test("keeps the exact closed public response projection", async () => {
        const endpoint = await handoffEndpoint();
        const body = endpoint.output?.[0]?.body;

        expect(Object.keys(body?.properties ?? {})).toEqual([
            "id",
            "externalOrderId",
            "expeditionNumber",
            "status",
            "sellerHandoffDeclaredAt",
        ]);
        expect(body?.required).toEqual(["id", "externalOrderId", "status", "sellerHandoffDeclaredAt"]);
        expect(body?.properties?.expeditionNumber).toEqual({
            type: "string",
            nullable: true,
        });
    });
});

type Endpoint = {
    method?: string;
    access?: string;
    targetUrl?: string;
    headers?: unknown;
    body?: unknown;
    output?: Array<{
        body?: {
            properties?: Record<string, unknown>;
            required?: string[];
        };
    }>;
};

async function handoffEndpoint(): Promise<Endpoint> {
    const definition = JSON.parse(await readFile(definitionUrl, "utf8")) as {
        artifacts: Array<{
            source?: { endpoints: Array<Endpoint & { endpointId?: string }> };
        }>;
    };
    const endpoint = definition.artifacts
        .find((artifact) => artifact.source)
        ?.source?.endpoints.find((candidate) => candidate.endpointId === "declareSellerHandoff");
    if (!endpoint) {
        throw new Error("declareSellerHandoff endpoint not found");
    }
    return endpoint;
}
