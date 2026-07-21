import { buyerOrder, shipment } from "./fixtures";

type Overrides = {
    order?: Record<string, unknown>;
    shipment?: Record<string, unknown>;
    items?: unknown;
    failAt?: "commerce" | "delivery";
};

export function successfulBuyerResponder(overrides: Overrides = {}): (request: Request) => Response {
    return (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/system/order/payment-context") {
            if (overrides.failAt === "commerce") {
                return privateFailure();
            }
            if (!validOrderSelector(url.searchParams.get("orderId"))) {
                return Response.json({ error: "Order not found", privateId: "private-order" }, { status: 404 });
            }
            return Response.json({
                ...buyerOrder,
                ...overrides.order,
            });
        }
        if (url.pathname === "/shipmentForExternalOrder") {
            if (overrides.failAt === "delivery") {
                return privateFailure();
            }
            return Response.json({
                items: overrides.items ?? [
                    {
                        ...shipment,
                        ...overrides.shipment,
                    },
                ],
            });
        }
        throw new Error(`Unexpected buyer tracking call: ${request.url}`);
    };
}

function validOrderSelector(value: string | null): boolean {
    if (value === null || value === "") {
        return false;
    }
    const orderId = Number(value);
    return Number.isSafeInteger(orderId) && orderId > 0;
}

function privateFailure(): Response {
    return Response.json(
        {
            error: "private upstream failure",
            recipientAddress: "7 Private Street",
            providerPayload: { reference: "private-provider-reference" },
        },
        { status: 409 },
    );
}
