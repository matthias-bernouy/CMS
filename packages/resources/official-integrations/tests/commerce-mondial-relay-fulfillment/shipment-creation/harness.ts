import {
    executeFulfillmentFunction,
    type Responder,
    type User,
} from "../order-contexts/shared/harness";
import { sellerId } from "./fixtures/context";
import { shipmentCreationSources } from "./sources";

export const functionId = "createShipmentForMySale";

export async function executeShipmentCreation(
    responder: Responder,
    options: {
        request?: Request;
        user?: User | null;
    } = {},
) {
    return await executeFulfillmentFunction({
        functionId,
        request: options.request ?? shipmentCreationRequest({ orderId: "42" }),
        responder,
        sources: await shipmentCreationSources(),
        user: options.user === null
            ? undefined
            : options.user ?? { id: sellerId, role: "user" },
    });
}

export function shipmentCreationRequest(body?: unknown): Request {
    return new Request(`https://cms.test/functions/${functionId}`, {
        method: "POST",
        ...(body === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            }),
    });
}
