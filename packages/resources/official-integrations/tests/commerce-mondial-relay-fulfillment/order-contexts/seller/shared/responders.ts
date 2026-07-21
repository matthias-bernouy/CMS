import { shipment } from "../../shared/fixtures";
import { fulfillment, handoff, labelAuthorization, labelCapability, sellerSale } from "./fixtures";

type Reply = unknown | Response;

export type SellerReplies = {
    sale?: Reply;
    shipments?: Reply;
    authorization?: Reply;
    capability?: Reply;
    handoff?: Reply;
    fulfillment?: Reply;
};

export function sellerResponder(replies: SellerReplies = {}): (request: Request) => Response {
    return (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/sellerContext") {
            return response(replies.sale ?? sellerSale);
        }
        if (pathname === "/shipmentForExternalOrder") {
            return response(replies.shipments ?? { items: [shipment] });
        }
        if (pathname === "/labelSellerContext") {
            return response(
                replies.authorization ??
                    replies.sale ?? {
                        publicId: sellerSale.publicId,
                        allowed: labelAuthorization.allowed,
                        sellerCmsUserId: labelAuthorization.sellerCmsUserId,
                    },
            );
        }
        if (pathname === "/issueLabelAccess") {
            return response(replies.capability ?? labelCapability, 201);
        }
        if (pathname === "/declareSellerHandoff") {
            return response(replies.handoff ?? handoff);
        }
        if (pathname === "/recordFulfillment") {
            return response(replies.fulfillment ?? fulfillment);
        }
        throw new Error(`Unexpected seller workflow call: ${request.url}`);
    };
}

function response(value: Reply, status = 200): Response {
    if (value instanceof Response) {
        return value;
    }
    return Response.json(value, { status });
}
