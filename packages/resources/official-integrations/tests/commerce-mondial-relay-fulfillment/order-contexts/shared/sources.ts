import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
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
    const sources = new InMemorySourceRepository();
    await sources.createSource(commerceSource());
    await sources.createSource(deliverySource());
    return sources;
}

function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        meta: { name: "Commerce" },
        endpoints: [{
            urn: makeEndpointUrn("commerce", "myOrder"),
            method: "GET",
            access: { mode: "auth" },
            targetUrl: "https://commerce.test/myOrder",
            headers: computedUserHeader(),
            input: {
                params: [{
                    name: "id",
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
                    shippingAddress: object(),
                    billingAddress: object(),
                    metadata: object(),
                    lines: array(object()),
                    financialTerms: object(),
                }),
            }],
        }],
    };
}

function deliverySource(): Source {
    return {
        urn: makeSourceUrn("delivery"),
        meta: { name: "Delivery" },
        endpoints: [{
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
        }],
    };
}
