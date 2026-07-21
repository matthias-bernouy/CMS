import { describe, expect, test } from "bun:test";
import { projectEndpointResponse, type SourceEndpoint } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";

type DefinitionEndpoint = Pick<SourceEndpoint, "method" | "targetUrl" | "output"> & {
    endpointId: string;
};

const definitionUrl = new URL("../../integrations/mondial-relay/versions/1.0.0/definition.json", import.meta.url);

describe("mondial-relay response contracts", () => {
    test("preserves nullable shipment list and detail fields", async () => {
        const list = {
            items: [
                {
                    id: "shipment-1",
                    externalOrderId: null,
                    expeditionNumber: null,
                    status: "creating",
                    lastError: null,
                    recipientName: "Ada Lovelace",
                    recipientPostalCode: "75001",
                    recipientCity: "Paris",
                    trackingUrl: null,
                    latestEventLabel: null,
                    createdAt: "2026-07-16T06:00:00.000Z",
                },
            ],
            limit: 50,
            offset: 0,
        };
        expect(await projectedBody("shipments", list)).toEqual(list);

        const detail = {
            id: "shipment-1",
            externalOrderId: null,
            expeditionNumber: null,
            status: "creating",
            createdAt: "2026-07-16T06:00:00.000Z",
            lastError: null,
            trackingUrl: null,
            recipientName: "Ada Lovelace",
            recipientEmail: null,
            recipientPhone: null,
            recipientAddressLine1: null,
            recipientAddressLine2: null,
            recipientPostalCode: "75001",
            recipientCity: "Paris",
            recipientCountry: "FR",
            weightGrams: 500,
            packageCount: 1,
            latestEventLabel: null,
            latestEventAt: null,
            carrierAcceptedAt: null,
            arrivedAtPickupPointAt: null,
            availableForPickupAt: null,
            recipientHandoffAt: null,
            pickupExpiredAt: null,
            returningToSenderAt: null,
            returnedToSenderAt: null,
            incidentAt: null,
            lostAt: null,
            sellerHandoffDeclaredAt: null,
            events: [
                {
                    eventLabel: "Shipment registered",
                    eventDate: null,
                    eventTime: null,
                    normalizedStatus: null,
                    occurredAt: null,
                    location: null,
                },
            ],
        };
        expect(await projectedBody("shipment", detail)).toEqual(detail);
    });

    test("preserves nulls returned by other database-backed routes", async () => {
        const cases: Array<[string, unknown]> = [
            ["relaySelection", { latitude: null, longitude: null }],
            ["saveRelaySelection", { latitude: null, longitude: null }],
            ["createShipment", { expeditionNumber: null, trackingUrl: null }],
            ["declareSellerHandoff", { expeditionNumber: null }],
            ["cancelShipmentReservation", { expeditionNumber: null }],
            [
                "reconcileShipments",
                {
                    staleCreations: [{ externalOrderId: null }],
                    shipments: [{ externalOrderId: null }],
                    events: [{ providerEventId: null }],
                    claimReturnEvents: [{ providerEventId: null, occurredAt: null }],
                },
            ],
            [
                "deliveryProjectionHealth",
                {
                    orders: [{ providerReference: null, trackingCheckedAt: null }],
                },
            ],
            [
                "failShipmentEventProjection",
                {
                    projectionNextAttemptAt: null,
                    projectionLastError: null,
                    projectionManualReviewAt: null,
                },
            ],
            [
                "shipmentProjectionExceptions",
                {
                    items: [
                        {
                            providerEventId: null,
                            normalizedStatus: null,
                            occurredAt: null,
                            projectionLastError: null,
                            projectionManualReviewAt: null,
                        },
                    ],
                },
            ],
            [
                "tracking",
                {
                    events: [
                        {
                            eventDate: null,
                            eventTime: null,
                            normalizedStatus: null,
                            occurredAt: null,
                            location: null,
                        },
                    ],
                },
            ],
        ];

        for (const [endpointId, payload] of cases) {
            expect(await projectedBody(endpointId, payload), endpointId).toEqual(payload);
        }
    });
});

async function projectedBody(endpointId: string, payload: unknown): Promise<unknown> {
    const endpoint = await definitionEndpoint(endpointId);
    const response = await projectEndpointResponse(
        endpoint,
        new Request("https://cms.test/source", { method: endpoint.method }),
        Response.json(payload),
    );
    expect(response.status, endpointId).toBe(200);
    return await response.json();
}

async function definitionEndpoint(endpointId: string): Promise<SourceEndpoint> {
    const definition = JSON.parse(await readFile(definitionUrl, "utf8")) as {
        artifacts: Array<{ source?: { endpoints: DefinitionEndpoint[] } }>;
    };
    const endpoint = definition.artifacts
        .find((artifact) => artifact.source)
        ?.source?.endpoints.find((candidate) => candidate.endpointId === endpointId);
    if (!endpoint) {
        throw new Error(`Missing Mondial Relay endpoint ${endpointId}`);
    }
    return { ...endpoint, urn: `urn:delivery:${endpointId}` };
}
