import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import {
    array,
    computedUserHeader,
    number,
    object,
    text,
} from "./shapes";

const event = object({
    eventLabel: text(),
    eventDate: text(true),
    eventTime: text(true),
    normalizedStatus: text(true),
    occurredAt: text(true),
    location: text(true),
});

const shipment = object({
    id: text(),
    expeditionNumber: text(true),
    status: text(),
    trackingUrl: text(true),
    deliveryRelayLocation: text(true),
    latestEventLabel: text(true),
    latestEventAt: text(true),
    carrierAcceptedAt: text(true),
    sellerHandoffDeclaredAt: text(true),
    recipientHandoffAt: text(true),
    createdAt: text(),
    events: array(event),
}, ["id", "status", "createdAt", "events"]);

export async function fulfillmentContextSources() {
    return await createFulfillmentSources(
        commerceSource().endpoints,
        deliverySource().endpoints,
    );
}

export async function createFulfillmentSources(
    commerceEndpoints: SourceEndpoint[],
    deliveryEndpoints: SourceEndpoint[],
) {
    const sources = new InMemorySourceRepository();
    await sources.createSource(source("commerce", commerceEndpoints));
    await sources.createSource(source("delivery", deliveryEndpoints));
    return sources;
}

function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        meta: { name: "Commerce" },
        endpoints: [{
            urn: makeEndpointUrn(
                "commerce",
                "getOrderFulfillmentBuyerContext",
            ),
            method: "GET",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/system/order/payment-context",
            headers: computedUserHeader(),
            input: {
                params: [{
                    name: "orderId",
                    in: "query",
                    schema: text(),
                }],
            },
            output: [{
                status: "200",
                body: object({
                    id: number(),
                    publicId: text(),
                    buyerCmsUserId: text(),
                }),
            }],
        }],
    };
}

function deliverySource(): Source {
    return source("delivery", [shipmentForExternalOrderEndpoint()]);
}

export function shipmentForExternalOrderEndpoint(): SourceEndpoint {
    return {
            urn: makeEndpointUrn("delivery", "shipmentForExternalOrder"),
            method: "GET",
            access: { mode: "system" },
            targetUrl: "https://delivery.test/shipmentForExternalOrder",
            input: {
                params: [{
                    name: "externalOrderId",
                    in: "query",
                    required: true,
                    schema: text(),
                }],
            },
            output: [{
                status: "200",
                body: object(
                    { items: array(shipment) },
                    ["items"],
                ),
            }],
    };
}

function source(id: string, endpoints: SourceEndpoint[]): Source {
    return {
        urn: makeSourceUrn(id),
        meta: { name: id === "commerce" ? "Commerce" : "Delivery" },
        endpoints,
    };
}
