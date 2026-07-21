import { reservation, sellerSetup } from "./fixtures/context";
import { quote, shipment } from "./fixtures/delivery";
import { fulfillment } from "./fixtures/result";

type ReplyValue = unknown | Response;
type Reply = ReplyValue | ((request: Request) => ReplyValue | Promise<ReplyValue>);

export type CreationReplies = {
    setup?: Reply;
    reservation?: Reply;
    quote?: Reply;
    shipment?: Reply;
    fulfillment?: Reply;
};

export function creationResponder(
    replies: CreationReplies = {},
): (request: Request) => Promise<Response> {
    return async request => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/shipmentCreationSellerContext") {
            return await response(request, replies.setup, sellerSetup);
        }
        if (pathname === "/reserveShipmentCreation") {
            return await response(request, replies.reservation, reservation);
        }
        if (pathname === "/resolveDeliveryQuote") {
            return await response(request, replies.quote, quote);
        }
        if (pathname === "/createShipment") {
            return await response(request, replies.shipment, shipment, 201);
        }
        if (pathname === "/completeShipmentCreation") {
            return await response(request, replies.fulfillment, fulfillment);
        }
        throw new Error(`Unexpected shipment creation call: ${request.url}`);
    };
}

export function privateFailure(status: number, error: string): Response {
    return Response.json({
        error,
        recipientAddress: "7 Private Street",
        providerPayload: { reference: "private-provider-reference" },
    }, { status });
}

async function response(
    request: Request,
    reply: Reply | undefined,
    fallback: unknown,
    status = 200,
): Promise<Response> {
    const value = typeof reply === "function"
        ? await reply(request)
        : reply ?? fallback;
    if (value instanceof Response) return value;
    return Response.json(value, { status });
}
