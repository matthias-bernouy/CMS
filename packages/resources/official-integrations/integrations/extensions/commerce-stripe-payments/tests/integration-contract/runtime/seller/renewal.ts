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

export async function assertSellerTermsRenewal(
    { sources, submitPriceFn }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { seller }: SellerEnrollmentState,
): Promise<void> {
    let renewedTermsBody: unknown;
    const renewedTermsPrice = await executeFunction(
        submitPriceFn,
        new Request("https://cms.test/functions/submitSellerOfferPrice", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                offerId: "42",
                amount: 12000,
                expectedVersion: 3,
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
                        return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: false }));
                    }
                    if (request.url.startsWith("https://stripe.test/enrollment")) {
                        renewedTermsBody = await request.json();
                        return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                    }
                    if (request.url.startsWith("https://commerce.test/offer/price")) {
                        return Response.json({ offer: { id: 42 }, proposal: { amount: 12000 } });
                    }
                    throw new Error(`unexpected renewed-terms call: ${request.url}`);
                },
            },
        },
    );
    expect(renewedTermsPrice.status).toBe(200);
    expect(renewedTermsBody).toEqual({
        marketplaceTermsAccepted: true,
        expectedMarketplaceTermsVersion: SELLER_TERMS_VERSION,
        expectedMarketplaceTermsHash: SELLER_TERMS_HASH,
    });
}
