import { authorization, shipment } from "./fixtures";

type Overrides = {
    authorization?: Record<string, unknown>;
    shipment?: Record<string, unknown>;
    empty?: boolean;
};

export function successfulResponder(
    overrides: Overrides = {},
): (request: Request) => Response {
    return request => {
        const url = new URL(request.url);
        const path = url.pathname;
        const currentAuthorization = {
            ...authorization,
            ...overrides.authorization,
        };
        const currentShipment = {
            ...shipment,
            ...overrides.shipment,
        };
        if (path === "/system/claim/return-authorization") {
            const claimId = Number(url.searchParams.get("claimId"));
            if (!Number.isSafeInteger(claimId)) {
                return Response.json(
                    { error: "claimId must be an integer" },
                    { status: 400 },
                );
            }
            return Response.json(currentAuthorization);
        }
        if (path === "/shipments") {
            return Response.json({
                items: overrides.empty ? [] : [{
                    id: currentShipment.id,
                    status: currentShipment.status,
                    recipientName: currentShipment.recipientName,
                    recipientPostalCode: currentShipment.recipientPostalCode,
                    recipientCity: currentShipment.recipientCity,
                    createdAt: currentShipment.createdAt,
                    privateListField: "must not leak",
                }],
                limit: 1,
                offset: 0,
            });
        }
        if (path === "/shipment") return Response.json(currentShipment);
        if (path === "/system/shipment-for-external-order") {
            return Response.json({
                items: overrides.empty ? [] : [currentShipment],
            });
        }
        throw new Error(`Unexpected claim tracking call: ${request.url}`);
    };
}

export function failingResponder(
    point: "authorization" | "delivery" | "hydration",
): (request: Request) => Response {
    return request => {
        const path = new URL(request.url).pathname;
        if (
            point === "authorization"
            && path === "/system/claim/return-authorization"
        ) {
            return privateFailure("claim authorization failed");
        }
        if (
            point === "delivery"
            && (
                path === "/shipments"
                || path === "/system/shipment-for-external-order"
            )
        ) {
            return privateFailure("delivery lookup failed");
        }
        if (
            point === "hydration"
            && (
                path === "/shipment"
                || path === "/system/shipment-for-external-order"
            )
        ) {
            return privateFailure("delivery hydration failed");
        }
        return successfulResponder()(request);
    };
}

function privateFailure(error: string): Response {
    return Response.json(
        {
            error,
            recipientAddress: "7 Private Street",
            providerPayload: { reference: "private-provider-reference" },
        },
        { status: 409 },
    );
}
