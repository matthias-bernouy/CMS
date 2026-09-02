import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import { type IntegrationContractContext, resolveCmsApiKey } from "../../harness";
import { connectStatus } from "../../sources/index";
import type { SellerEnrollmentState } from "./enrollment";

export async function assertSellerInputValidation(
    { sources, submitPriceFn }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { seller, assertCurrentTermsQuery }: SellerEnrollmentState,
): Promise<void> {
    const untrustedContactEmail = await executeFunction(
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
                contactEmail: "attacker@example.test",
                marketplaceTermsVersion: "attacker-selected-version",
                marketplaceTermsHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            }),
        }),
        {
            sources,
            identities,
            user: { id: "seller-subject", role: "user" },
            deps: {
                identities,
                resolveSecret: resolveCmsApiKey,
                fetchImpl: async () => {
                    throw new Error("strict input must reject before calls");
                },
            },
        },
    );
    expect(untrustedContactEmail.status).toBe(400);

    const missingTermsConsent = await executeFunction(
        submitPriceFn,
        new Request("https://cms.test/functions/submitSellerOfferPrice", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                offerId: "42",
                amount: 12000,
                expectedVersion: 3,
                accountToken: "accttok_first",
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
                    throw new Error(`unexpected missing-consent call: ${request.url}`);
                },
            },
        },
    );
    expect(missingTermsConsent.status).toBe(409);
    expect(await missingTermsConsent.json()).toEqual({
        error: "The current seller terms must be accepted before submitting a price",
    });

    const missingAccountToken = await executeFunction(
        submitPriceFn,
        new Request("https://cms.test/functions/submitSellerOfferPrice", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ offerId: "42", amount: 12000, expectedVersion: 3, sellerTermsAccepted: true }),
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
                    throw new Error(`unexpected missing-token call: ${request.url}`);
                },
            },
        },
    );
    expect(missingAccountToken.status).toBe(409);
    expect(await missingAccountToken.json()).toEqual({
        error: "Seller enrollment is required before submitting a price",
    });
}
