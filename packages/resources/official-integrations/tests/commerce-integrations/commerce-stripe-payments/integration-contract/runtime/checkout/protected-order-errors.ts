import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

const businessStatuses = [400, 403, 404, 409, 422] as const;
const orderInput = {
    idempotencyKey: "protected-checkout-errors",
    items: [{ offerId: "91", quantity: 1 }],
};

export async function assertProtectedOrderErrorContracts(
    { protectedOrderFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    await assertSellerContextErrors(protectedOrderFn, sources, identities);
    for (const status of businessStatuses) {
        const calls: string[] = [];
        const response = await executeProtectedOrder(protectedOrderFn, sources, identities, async (request) => {
            calls.push(new URL(request.url).pathname);
            if (request.url.includes("seller-context")) {
                return Response.json({
                    sellerCmsUserId: "seller-subject",
                    buyerCmsUserId: "buyer-subject",
                });
            }
            if (request.url.includes("seller-eligibility")) {
                return Response.json({ eligible: true, reasonCode: "eligible" });
            }
            if (request.url.includes("sale-capability")) {
                return saleCapabilityResponse();
            }
            return Response.json({ error: `business-${status}`, internalReason: "must-not-leak" }, { status });
        });

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: `business-${status}` });
        expect(calls).toEqual([
            "/protected-checkout/seller-context",
            "/seller-eligibility",
            "/seller/sale-capability",
            "/order/create",
        ]);
    }

    await expectMasked(protectedOrderFn, sources, identities, "credential", 401);
    await expectMasked(protectedOrderFn, sources, identities, "provider", 403);
    await expectMasked(protectedOrderFn, sources, identities, "server", 500);
}

async function assertSellerContextErrors(
    fn: IntegrationContractContext["protectedOrderFn"],
    sources: IntegrationContractContext["sources"],
    identities: InMemoryIdentityService,
): Promise<void> {
    for (const status of businessStatuses) {
        const calls: string[] = [];
        const response = await executeProtectedOrder(fn, sources, identities, async (request) => {
            calls.push(new URL(request.url).pathname);
            return Response.json({ error: `seller-context-${status}`, internalReason: "must-not-leak" }, { status });
        });

        expect(response.status).toBe(status);
        expect(await response.json()).toEqual({ error: `seller-context-${status}` });
        expect(calls).toEqual(["/protected-checkout/seller-context"]);
    }
}

async function expectMasked(
    fn: IntegrationContractContext["protectedOrderFn"],
    sources: IntegrationContractContext["sources"],
    identities: InMemoryIdentityService,
    failureAt: "credential" | "provider" | "server",
    status: number,
): Promise<void> {
    const response = await executeProtectedOrder(fn, sources, identities, async (request) => {
        if (failureAt === "credential" && request.url.includes("seller-context")) {
            return Response.json({ error: "invalid CMS API key", secret: "must-not-leak" }, { status });
        }
        if (request.url.includes("seller-context")) {
            return Response.json({
                sellerCmsUserId: "seller-subject",
                buyerCmsUserId: "buyer-subject",
            });
        }
        if (failureAt === "provider" && request.url.includes("seller-eligibility")) {
            return Response.json({ error: "provider credential rejected", secret: "must-not-leak" }, { status });
        }
        if (request.url.includes("seller-eligibility")) {
            return Response.json({ eligible: true, reasonCode: "eligible" });
        }
        if (request.url.includes("sale-capability")) {
            return saleCapabilityResponse();
        }
        return Response.json({ error: "internal error", secret: "must-not-leak" }, { status });
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
        error: "Function execution failed",
        correlationId: response.headers.get("x-correlation-id"),
    });
}

function saleCapabilityResponse(): Response {
    return Response.json({
        sellerId: 17,
        capabilityKey: "protected_payment",
        ready: true,
        confirmedAt: "2026-07-23T12:00:00.000Z",
        revokedAt: null,
    });
}

async function executeProtectedOrder(
    fn: IntegrationContractContext["protectedOrderFn"],
    sources: IntegrationContractContext["sources"],
    identities: InMemoryIdentityService,
    fetchImpl: (request: Request) => Promise<Response>,
): Promise<Response> {
    return await executeFunction(
        fn,
        new Request("https://cms.test/functions/createProtectedOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(orderInput),
        }),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                responseProjectionMode: "strict",
                reportResponseProjectionEvent: () => undefined,
                fetchImpl: async (input, init) => await fetchImpl(new Request(input, init)),
            },
        },
    );
}
