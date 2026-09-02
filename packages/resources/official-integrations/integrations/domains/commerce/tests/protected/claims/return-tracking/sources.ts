import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type DataShape,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

const string = (nullable = false): DataShape => ({
    type: "string",
    ...(nullable ? { nullable: true } : {}),
});
const number = (): DataShape => ({ type: "number" });
const boolean = (): DataShape => ({ type: "boolean" });
const object = (properties: Record<string, DataShape>, required = Object.keys(properties)): DataShape => ({
    type: "object",
    properties,
    required,
});
const array = (items: DataShape): DataShape => ({ type: "array", items });

const eventShape = object({
    eventLabel: string(),
    eventDate: string(true),
    eventTime: string(true),
    normalizedStatus: string(true),
    occurredAt: string(true),
    location: string(true),
});
const trackingFields = {
    id: string(),
    expeditionNumber: string(true),
    status: string(),
    trackingUrl: string(true),
    deliveryRelayLocation: string(true),
    latestEventLabel: string(true),
    latestEventAt: string(true),
    carrierAcceptedAt: string(true),
    sellerHandoffDeclaredAt: string(true),
    recipientHandoffAt: string(true),
    createdAt: string(),
    events: array(eventShape),
};

export async function claimTrackingSources(): Promise<InMemorySourceRepository> {
    const sources = new InMemorySourceRepository();
    await sources.createSource(
        source("commerce", [
            get(
                "commerce",
                "getClaimReturnAuthorization",
                "https://commerce.test/system/claim/return-authorization",
                [{ name: "claimId", type: "number", required: true }],
                object({
                    allowed: boolean(),
                    reason: string(),
                    claimId: number(),
                    claimPublicId: string(),
                    claimStatus: string(),
                    claimVersion: number(),
                    returnShipByAt: string(true),
                    returnDeliveryStatus: string(true),
                    orderId: number(),
                    orderPublicId: string(),
                    orderNumber: string(),
                    buyerCmsUserId: string(),
                    sellerId: number(),
                    sellerCmsUserId: string(),
                    deliveryQuoteId: string(),
                    merchandiseSubtotalMinorAmount: number(),
                    currency: string(),
                }),
                { mode: "system" },
            ),
        ]),
    );
    await sources.createSource(
        source("delivery", [
            get(
                "delivery",
                "shipmentForExternalOrder",
                "https://delivery.test/system/shipment-for-external-order",
                [{ name: "externalOrderId", type: "string", required: true }],
                object({ items: array(object(trackingFields)) }),
                { mode: "system" },
            ),
        ]),
    );
    return sources;
}

type Param = {
    name: string;
    type: "number" | "string";
    required: boolean;
};

function source(id: string, endpoints: SourceEndpoint[]): Source {
    return { urn: makeSourceUrn(id), meta: { name: id }, endpoints };
}

function get(
    sourceId: string,
    endpointId: string,
    targetUrl: string,
    params: Param[],
    body: DataShape,
    access: SourceEndpoint["access"],
): SourceEndpoint {
    return {
        urn: makeEndpointUrn(sourceId, endpointId),
        method: "GET",
        access,
        targetUrl,
        input: {
            params: params.map((param) => ({
                name: param.name,
                in: "query",
                required: param.required,
                schema: { type: param.type },
            })),
        },
        output: [{ status: "200", body }],
    };
}
