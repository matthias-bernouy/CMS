import { connectStatus, offerResult, seller } from "./fixtures";

type Reply = unknown | Response | ((request: Request) => unknown | Response | Promise<unknown | Response>);

export type SellerPriceReplies = {
    seller?: Reply;
    status?: Reply;
    enrollment?: Reply;
    result?: Reply;
};

export function sellerPriceResponder(replies: SellerPriceReplies = {}): (request: Request) => Promise<Response> {
    return async (request) => {
        const path = new URL(request.url).pathname;
        if (path === "/seller") {
            return await response(request, replies.seller, seller);
        }
        if (path === "/status") {
            return await response(request, replies.status, connectStatus());
        }
        if (path === "/enrollment") {
            return await response(
                request,
                replies.enrollment,
                connectStatus({
                    enrolled: true,
                    currentTermsAccepted: true,
                }),
            );
        }
        if (path === "/offer/price") {
            return await response(request, replies.result, offerResult);
        }
        throw new Error(`Unexpected seller-price call: ${request.url}`);
    };
}

export function privateFailure(status: number, error: string): Response {
    return Response.json({ error, privateProviderId: "private_42" }, { status });
}

async function response(request: Request, reply: Reply | undefined, fallback: unknown): Promise<Response> {
    const value = typeof reply === "function" ? await reply(request) : (reply ?? fallback);
    return value instanceof Response ? value : Response.json(value);
}
