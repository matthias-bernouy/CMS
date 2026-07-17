import { order, payment } from "./expected";

export function successfulResponder(request: Request): Response {
    const path = new URL(request.url).pathname;
    if (path === "/me/order") return Response.json(order);
    if (path === "/system/order/payment-context") {
        return Response.json({
            id: order.id,
            publicId: order.publicId,
            buyerCmsUserId: order.buyerCmsUserId,
        });
    }
    if (path === "/payments/reference") {
        return Response.json({ exists: true, payment });
    }
    if (path === "/system/order/payment") {
        return Response.json({
            id: 31,
            orderId: order.id,
            accepted: true,
            idempotentReplay: false,
        });
    }
    throw new Error(`Unexpected payment workflow call: ${request.url}`);
}

export function missingPaymentResponder(request: Request): Response {
    if (new URL(request.url).pathname === "/payments/reference") {
        return Response.json({ exists: false });
    }
    return successfulResponder(request);
}

export function failingResponder(
    point: "order" | "payment" | "projection",
) {
    return (request: Request): Response => {
        const path = new URL(request.url).pathname;
        if (
            point === "order"
            && (path === "/me/order" || path === "/system/order/payment-context")
        ) {
            return Response.json(
                { error: "order not found", privateRowId: 71 },
                { status: 404 },
            );
        }
        if (point === "payment" && path === "/payments/reference") {
            return Response.json(
                { error: "provider refresh refused", stripeRequestId: "req_private" },
                { status: 409 },
            );
        }
        if (point === "projection" && path === "/system/order/payment") {
            return Response.json(
                { error: "financial projection refused", internalRevision: 17 },
                { status: 409 },
            );
        }
        return successfulResponder(request);
    };
}
