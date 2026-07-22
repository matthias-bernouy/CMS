import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import { type IntegrationContractContext, resolveCmsApiKey } from "../../harness";
import { connectStatus } from "../../sources/index";
import type { SellerEnrollmentState } from "./enrollment";

export async function assertSellerEnrollmentFailures(
    { sources, submitPriceFn }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { seller }: SellerEnrollmentState,
): Promise<void> {
    let priceCalledAfterFailedEnrollment = false;
    const incompleteEnrollment = await executeFunction(
        submitPriceFn,
        new Request("https://cms.test/functions/submitSellerOfferPrice", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                offerId: "42",
                amount: 12000,
                expectedVersion: 3,
                accountToken: "accttok_first",
                sellerTermsAccepted: true,
            }),
        }),
        {
            sources,
            identities,
            user: { id: "seller-subject", role: "user" },
            deps: {
                identities,
                resolveSecret: resolveCmsApiKey,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/seller")) {
                        return Response.json(seller);
                    }
                    if (request.url.startsWith("https://stripe.test/status")) {
                        return Response.json(connectStatus());
                    }
                    if (request.url.startsWith("https://stripe.test/enrollment")) {
                        return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: false }));
                    }
                    if (request.url.startsWith("https://commerce.test/offer/price")) {
                        priceCalledAfterFailedEnrollment = true;
                    }
                    throw new Error(`unexpected incomplete enrollment call: ${request.url}`);
                },
            },
        },
    );
    expect(incompleteEnrollment.status).toBe(409);
    expect(await incompleteEnrollment.json()).toEqual({
        error: "Seller enrollment is not ready for held payments",
    });
    expect(priceCalledAfterFailedEnrollment).toBe(false);

    const safeProviderFailure = await executeFunction(
        submitPriceFn,
        new Request("https://cms.test/functions/submitSellerOfferPrice", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                offerId: "42",
                amount: 12000,
                expectedVersion: 3,
                accountToken: "accttok_first",
                sellerTermsAccepted: true,
            }),
        }),
        {
            sources,
            identities,
            user: { id: "seller-subject", role: "user" },
            deps: {
                identities,
                resolveSecret: resolveCmsApiKey,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/seller")) {
                        return Response.json(seller);
                    }
                    if (request.url.startsWith("https://stripe.test/status")) {
                        return Response.json(connectStatus());
                    }
                    if (request.url.startsWith("https://stripe.test/enrollment")) {
                        return Response.json({ error: "accttok_first leaked provider detail" }, { status: 400 });
                    }
                    throw new Error(`unexpected safe-error call: ${request.url}`);
                },
            },
        },
    );
    expect(safeProviderFailure.status).toBe(502);
    const safeProviderFailureBody = (await safeProviderFailure.json()) as Record<string, unknown>;
    expect(safeProviderFailureBody).toEqual({
        error: "Function execution failed",
        correlationId: expect.any(String),
    });
    expect(JSON.stringify(safeProviderFailureBody)).not.toContain("accttok_first");
}
