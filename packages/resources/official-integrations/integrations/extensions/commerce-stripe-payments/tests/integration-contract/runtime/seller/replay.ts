import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import { type IntegrationContractContext, resolveCmsApiKey } from "../../harness";
import { connectStatus } from "../../sources/index";
import type { SellerEnrollmentState } from "./enrollment";

export async function assertSellerPriceReplay(
    { sources, submitPriceFn }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { seller }: SellerEnrollmentState,
): Promise<void> {
    let replayEnrollmentBody: unknown;
    const replayedPrice = await executeFunction(
        submitPriceFn,
        new Request("https://cms.test/functions/submitSellerOfferPrice", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ offerId: "42", amount: 12000, expectedVersion: 3 }),
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
                        return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                    }
                    if (request.url.startsWith("https://stripe.test/enrollment")) {
                        replayEnrollmentBody = await request.json();
                        return Response.json(connectStatus({ enrolled: true, currentTermsAccepted: true }));
                    }
                    if (request.url.startsWith("https://commerce.test/offer/price")) {
                        return Response.json({ offer: { id: 42 }, proposal: { amount: 12000 } });
                    }
                    throw new Error(`unexpected replay call: ${request.url}`);
                },
            },
        },
    );
    expect(replayedPrice.status).toBe(200);
    expect(replayEnrollmentBody).toEqual({});
}
