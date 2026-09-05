import { describe, expect, test } from "bun:test";
import { loadIntegrationDefinition } from "../../../../../../tests/helpers/integrationDefinition";

type JsonRecord = Record<string, unknown>;

const definitionUrl = new URL("../../../definition.json", import.meta.url);

describe("Mondial Relay shipment tracking context source contract", () => {
    test("declares one bounded system endpoint with the two exact legacy DTOs", async () => {
        const endpoints = await sourceEndpoints();
        const shipment = endpoint(endpoints, "shipment");
        const tracking = endpoint(endpoints, "tracking");
        const context = endpoint(endpoints, "shipmentTrackingContext");
        const contextBody = successBody(context);
        const properties = contextBody.properties as JsonRecord;

        expect(context).toMatchObject({
            method: "GET",
            access: "system",
            targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-delivery/system/shipment-tracking-context",
            params: [
                { name: "expeditionNumber", in: "query", type: "string", required: true },
                { name: "expectedExternalOrderId", in: "query", type: "string", required: true },
            ],
        });
        expect(properties.shipment).toEqual(successBody(shipment));
        expect(properties.tracking).toEqual(successBody(tracking));
        expect(contextBody.required).toEqual(["shipment", "tracking"]);
        expect(JSON.stringify(context)).not.toContain("rpc");
    });
});

async function sourceEndpoints(): Promise<JsonRecord[]> {
    const definition = await loadIntegrationDefinition<JsonRecord>(definitionUrl);
    const artifacts = definition.artifacts as JsonRecord[];
    const sourceArtifact = artifacts.find((artifact) => artifact.type === "source");
    const source = sourceArtifact?.source as JsonRecord;
    return source.endpoints as JsonRecord[];
}

function endpoint(endpoints: JsonRecord[], id: string): JsonRecord {
    const value = endpoints.find((candidate) => candidate.endpointId === id);
    if (!value) {
        throw new Error(`${id} endpoint not found`);
    }
    return value;
}

function successBody(endpointDefinition: JsonRecord): JsonRecord {
    const output = (endpointDefinition.output as JsonRecord[]).find((candidate) => candidate.status === "200");
    if (!output || typeof output.body !== "object" || output.body === null) {
        throw new Error(`${String(endpointDefinition.endpointId)} success body not found`);
    }
    return output.body as JsonRecord;
}
