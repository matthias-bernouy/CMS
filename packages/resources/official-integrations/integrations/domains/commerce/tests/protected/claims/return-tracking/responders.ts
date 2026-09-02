import { authorization, shipment } from "./fixtures";

type Overrides = {
    authorization?: Record<string, unknown>;
    shipment?: Record<string, unknown>;
    empty?: boolean;
};

export function successfulResponder(overrides: Overrides = {}): (request: Request) => Response {
    return (request) => {
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
                return Response.json({ error: "claimId must be an integer" }, { status: 400 });
            }
            return Response.json(currentAuthorization);
        }
        if (path === "/system/shipment-for-external-order") {
            return Response.json({
                items: overrides.empty ? [] : [currentShipment],
            });
        }
        throw new Error(`Unexpected claim tracking call: ${request.url}`);
    };
}

export function failingResponder(point: "authorization" | "delivery" | "hydration"): (request: Request) => Response {
    return (request) => {
        const path = new URL(request.url).pathname;
        if (point === "authorization" && path === "/system/claim/return-authorization") {
            return privateFailure("claim authorization failed");
        }
        if ((point === "delivery" || point === "hydration") && path === "/system/shipment-for-external-order") {
            return privateFailure(point === "delivery" ? "delivery lookup failed" : "delivery hydration failed");
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
