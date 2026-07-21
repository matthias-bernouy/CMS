import {
    executeFulfillmentFunction,
    type Responder,
    type User,
} from "../../shared/harness";
import { sellerId } from "./fixtures";
import { sellerContextSources } from "./sources";

export async function executeSellerFunction(
    functionId: string,
    request: Request,
    responder: Responder,
    user: User | null = { id: sellerId, role: "user" },
) {
    return await executeFulfillmentFunction({
        functionId,
        request,
        responder,
        sources: await sellerContextSources(),
        user: user ?? undefined,
    });
}

export function sellerGetRequest(
    functionId: string,
    orderId?: string,
): Request {
    const url = new URL(`https://cms.test/functions/${functionId}`);
    if (orderId !== undefined) url.searchParams.set("orderId", orderId);
    return new Request(url);
}

export function sellerPostRequest(
    functionId: string,
    body?: unknown,
): Request {
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
