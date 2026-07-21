import { describe, expect, test } from "bun:test";

import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";

installCommerceTestEnvironment();

describe("seller payout eligibility verification", () => {
    test("binds the narrow system transition to the current CMS user", async () => {
        setRestResponder((request) =>
            request.url.includes("/rpc/verify_pending_seller_payout_eligibility")
                ? jsonResponse({
                      seller: {
                          id: 184,
                          cms_user_id: "seller-subject",
                          verification_status: "verified",
                          verified_by: "system:payout-eligibility",
                          version: 2,
                      },
                      transitioned: true,
                      idempotentReplay: false,
                  })
                : jsonResponse({ error: "unexpected request" }, 500),
        );

        const response = await requestCommerce("/system/seller/payout-eligibility", {
            userId: "seller-subject",
            body: {
                sellerId: 184,
                expectedVersion: 1,
                provider: "stripe",
                providerAccountId: "acct_seller",
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            seller: {
                id: 184,
                cmsUserId: "seller-subject",
                verificationStatus: "verified",
                verifiedBy: "system:payout-eligibility",
                version: 2,
            },
            transitioned: true,
            idempotentReplay: false,
        });
        expect(expectSingleRpc("verify_pending_seller_payout_eligibility").body).toEqual({
            p_cms_user_id: "seller-subject",
            p_seller_id: 184,
            p_expected_version: 1,
            p_provider: "stripe",
            p_provider_account_id: "acct_seller",
        });
    });

    test("rejects calls without a server-bound CMS user", async () => {
        const response = await requestCommerce("/system/seller/payout-eligibility", {
            body: {
                sellerId: 184,
                expectedVersion: 1,
                provider: "stripe",
                providerAccountId: "acct_seller",
            },
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "missing CMS user id" });
    });
});
