import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import { array, eventShape, number, object, text, trackingShape } from "./shapes";

const shipmentShape = object({
    id: text(),
    externalOrderId: text(true),
    expeditionNumber: text(true),
    status: text(),
    createdAt: text(),
    lastError: text(true),
    trackingUrl: text(true),
    deliveryRelayLocation: text(true),
    latestEventLabel: text(true),
    latestEventAt: text(true),
    carrierAcceptedAt: text(true),
    sellerHandoffDeclaredAt: text(true),
    recipientHandoffAt: text(true),
    events: array(eventShape),
});

export async function claimReturnEventSources(): Promise<InMemorySourceRepository> {
    const repository = new InMemorySourceRepository();
    await repository.createSource(source("delivery", [shipmentEndpoint(), trackingEndpoint()]));
    await repository.createSource(source("commerce", [recordClaimEndpoint()]));
    return repository;
}

function shipmentEndpoint(): SourceEndpoint {
    return endpoint("delivery", "shipment", "GET", "/shipment", shipmentShape, ["expeditionNumber"]);
}

function trackingEndpoint(): SourceEndpoint {
    return endpoint("delivery", "tracking", "GET", "/tracking", trackingShape, ["expeditionNumber"]);
}

function recordClaimEndpoint(): SourceEndpoint {
    return {
        ...endpoint(
            "commerce",
            "recordClaimReturnDelivery",
            "POST",
            "/recordClaimReturnDelivery",
            object({ id: number(), status: text(), returnDeliveryStatus: text() }),
        ),
        input: {
            body: object({
                claimId: number(),
                providerEventId: text(),
                providerReference: text(),
                normalizedStatus: text(),
                occurredAt: text(),
                providerEvidence: object({ provider: text(), shipmentId: text(), providerStatus: text() }),
            }),
        },
    };
}

function endpoint(
    sourceId: string,
    id: string,
    method: "GET" | "POST",
    path: string,
    output: ReturnType<typeof object>,
    params: string[] = [],
): SourceEndpoint {
    return {
        urn: makeEndpointUrn(sourceId, id),
        method,
        access: { mode: "system" },
        targetUrl: `https://${sourceId}.test${path}`,
        input: { params: params.map((name) => ({ name, in: "query", required: true, schema: text() })) },
        output: [{ status: "200", body: output }],
    };
}

function source(id: string, endpoints: SourceEndpoint[]): Source {
    return { urn: makeSourceUrn(id), meta: { name: id }, endpoints };
}
