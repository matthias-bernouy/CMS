import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import { type IntegrationContractContext, SELLER_TERMS_HASH, SELLER_TERMS_VERSION } from "../../harness";
import { connectStatus } from "../../sources/index";

export async function assertSellerEnrollment(
    { enrollmentFn, sources, submitPriceFn }: IntegrationContractContext,
    identities: InMemoryIdentityService,
) {
    const seller = {
        exists: true,
        id: 184,
        cmsUserId: "seller-subject",
        verificationStatus: "pending",
        version: 1,
    };
    const assertCurrentTermsQuery = (request: Request) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("marketplaceTermsVersion")).toBe(SELLER_TERMS_VERSION);
        expect(url.searchParams.get("marketplaceTermsHash")).toBe(SELLER_TERMS_HASH);
    };
    const enrollmentResponse = await executeFunction(
        enrollmentFn,
        new Request("https://cms.test/functions/getSellerSaleEnrollment"),
        {
            sources,
            identities,
            user: { id: "seller-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://stripe.test/status")) {
                        assertCurrentTermsQuery(request);
                        return Response.json({
                            ...connectStatus({ enrolled: true, currentTermsAccepted: true }),
                            marketplaceTermsVersion: SELLER_TERMS_VERSION,
                            marketplaceTermsHash: SELLER_TERMS_HASH,
                            marketplaceTermsAcceptedAt: "2026-07-13T12:00:00.000Z",
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/seller")) {
                        return Response.json(seller);
                    }
                    throw new Error(`unexpected enrollment read call: ${request.url}`);
                },
            },
        },
    );
    expect(enrollmentResponse.status).toBe(200);
    const enrollment = (await enrollmentResponse.json()) as Record<string, any>;
    expect(enrollment).toMatchObject({
        seller: { verificationStatus: "pending" },
        connect: {
            canAcceptHeldPayments: true,
            marketplaceTermsCurrentVersionAccepted: true,
            payoutsEnabled: false,
            canReceiveProtectedPayments: false,
            stripeTransfersStatus: "unrequested",
            bankAccountStatus: "not_attached",
            payoutBankReady: false,
        },
    });
    expect(enrollment.connect.marketplaceTermsVersion).toBeUndefined();
    expect(enrollment.connect.marketplaceTermsHash).toBeUndefined();
    expect(enrollment.connect.marketplaceTermsAcceptedAt).toBeUndefined();

    const pendingEnrollmentResponse = await executeFunction(
        enrollmentFn,
        new Request("https://cms.test/functions/getSellerSaleEnrollment"),
        {
            sources,
            identities,
            user: { id: "seller-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://stripe.test/status")) {
                        return Response.json({
                            ...connectStatus(),
                            stripeAccountId: null,
                            marketplaceTermsAcceptedAt: null,
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/seller")) {
                        return Response.json(seller);
                    }
                    throw new Error(`unexpected pending enrollment call: ${request.url}`);
                },
            },
        },
    );
    expect(pendingEnrollmentResponse.status).toBe(200);
    expect(await pendingEnrollmentResponse.json()).toMatchObject({
        connect: { connected: false, stripeAccountId: null },
        seller: { cmsUserId: "seller-subject" },
    });

    const serializedSubmit = JSON.stringify(submitPriceFn);
    expect(serializedSubmit).toContain("enrollConnectSeller");
    expect(serializedSubmit).toContain("canAcceptHeldPayments");
    expect(serializedSubmit).toContain("marketplaceTermsCurrentVersionAccepted");
    expect(serializedSubmit).not.toContain("canReceiveProtectedPayments");
    expect(serializedSubmit).not.toContain("payoutsEnabled");
    expect(serializedSubmit).not.toContain("verificationStatus");
    expect(serializedSubmit).not.toContain("verifyPendingSellerPayoutEligibility");
    expect(serializedSubmit).not.toContain("contactEmail");
    return { seller, assertCurrentTermsQuery };
}

export type SellerEnrollmentState = Awaited<ReturnType<typeof assertSellerEnrollment>>;
