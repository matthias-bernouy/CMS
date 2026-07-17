import {
    authorization,
    finalizedOrder,
    lockedFinancialTerms,
    order,
    publicRelayPoint,
    resolvedQuote,
    savedQuote,
    sellerAccount,
} from "./fixtures";

export type FailurePoint =
    | "order"
    | "authorization"
    | "account"
    | "save"
    | "resolve"
    | "lock"
    | "public";

type Overrides = {
    order?: Record<string, unknown>;
    authorization?: Record<string, unknown>;
    account?: Record<string, unknown>;
    savedQuote?: Record<string, unknown>;
    resolvedQuote?: Record<string, unknown>;
    publicQuote?: Record<string, unknown>;
    failAt?: FailurePoint;
};

export function successfulResponder(
    overrides: Overrides = {},
): (request: Request) => Response {
    return request => {
        const path = new URL(request.url).pathname;
        const point = pointForPath(path);
        if (overrides.failAt === point) return privateFailure(point);
        if (path === "/order") {
            return Response.json({ ...order, ...overrides.order });
        }
        if (path === "/quote-authorization") {
            return Response.json({
                ...authorization,
                ...overrides.authorization,
            });
        }
        if (path === "/account") {
            return Response.json({ ...sellerAccount, ...overrides.account });
        }
        if (path === "/relay-selection") {
            return Response.json({
                ...savedQuote,
                latitude: 48.864,
                longitude: 2.348,
                privateProviderField: "must not leak",
                ...overrides.savedQuote,
            });
        }
        if (path === "/resolve") {
            return Response.json({
                ...resolvedQuote,
                ...overrides.resolvedQuote,
            });
        }
        if (path === "/financial-lock") {
            return Response.json({
                ...lockedFinancialTerms,
                internalReview: "must not leak",
            });
        }
        if (path === "/public") {
            return Response.json({
                ...publicRelayPoint,
                orderVersion: 1,
                revision: 9,
                selectedForCmsUserId: "buyer-subject",
                latitude: 48.864,
                longitude: 2.348,
                merchandiseSubtotalMinorAmount: 1000,
                recipientSnapshot: {
                    addressLine1: "7 Private Street",
                    phone: "+33600000000",
                },
                sellerFulfillmentSnapshot: {
                    addressLine1: "9 Seller Street",
                    phone: "+33611111111",
                },
                providerPayload: { reference: "private-provider-reference" },
                ...overrides.publicQuote,
            });
        }
        throw new Error(`Unexpected relay workflow call: ${request.url}`);
    };
}

export function successfulGetResponder(
    overrides: Overrides = {},
): (request: Request) => Response {
    return successfulResponder({
        ...overrides,
        order: { ...finalizedOrder, ...overrides.order },
    });
}

export function selectorResponder(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/order") {
        const id = url.searchParams.get("id");
        if (!id || !/^-?\d+$/.test(id) || !Number.isSafeInteger(Number(id))) {
            return Response.json(
                { error: "id or publicId is required" },
                { status: 400 },
            );
        }
        if (id !== "42") {
            return Response.json({ error: "order not found" }, { status: 404 });
        }
    }
    return successfulResponder()(request);
}

function privateFailure(point: FailurePoint): Response {
    return Response.json({
        error: `${point} failed`,
        shippingAddress: { addressLine1: "7 Private Street" },
        providerPayload: { reference: "private-provider-reference" },
    }, { status: point === "order" ? 404 : 409 });
}

function pointForPath(path: string): FailurePoint {
    const point = ({
        "/order": "order",
        "/quote-authorization": "authorization",
        "/account": "account",
        "/relay-selection": "save",
        "/resolve": "resolve",
        "/financial-lock": "lock",
        "/public": "public",
    } as const)[path];
    if (!point) throw new Error(`Unexpected relay path: ${path}`);
    return point;
}
