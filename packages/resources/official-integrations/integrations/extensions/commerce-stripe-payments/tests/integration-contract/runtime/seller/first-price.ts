import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import {
    type IntegrationContractContext,
    resolveCmsApiKey,
    SELLER_TERMS_HASH,
    SELLER_TERMS_VERSION,
} from "../../harness";
import { connectStatus } from "../../sources/index";
import type { SellerEnrollmentState } from "./enrollment";

export async function assertFirstSellerPrice(
    { sources, submitPriceFn }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { seller, assertCurrentTermsQuery }: SellerEnrollmentState,
): Promise<void> {
    let firstEnrollmentBody: unknown;
    let firstPriceBody: unknown;
    const submittedFirstPrice = await executeFunction(
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
                sellerTermsVersion: SELLER_TERMS_VERSION,
                sellerTermsHash: SELLER_TERMS_HASH,
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
                        assertCurrentTermsQuery(request);
                        return Response.json(connectStatus());
                    }
                    if (request.url.startsWith("https://stripe.test/enrollment")) {
                        firstEnrollmentBody = await request.json();
                        return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                    }
                    if (request.url.startsWith("https://commerce.test/offer/price")) {
                        expect(new URL(request.url).searchParams.get("id")).toBe("42");
                        firstPriceBody = await request.json();
                        return Response.json({
                            offer: { id: 42, workflowState: "approved" },
                            proposal: { amount: 12000 },
                        });
                    }
                    throw new Error(`unexpected first price call: ${request.url}`);
                },
            },
        },
    );
    expect(submittedFirstPrice.status).toBe(200);
    expect(await submittedFirstPrice.json()).toEqual({
        offer: { id: 42, workflowState: "approved" },
        proposal: { amount: 12000 },
    });
    expect(firstEnrollmentBody).toEqual({
        accountToken: "accttok_first",
        marketplaceTermsAccepted: true,
        expectedMarketplaceTermsVersion: SELLER_TERMS_VERSION,
        expectedMarketplaceTermsHash: SELLER_TERMS_HASH,
    });
    expect(firstPriceBody).toEqual({ amount: 12000, expectedVersion: 3 });
}
