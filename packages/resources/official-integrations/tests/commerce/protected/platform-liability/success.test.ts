import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { authorizedControlResponse, controlResponse, preparedPaymentResponse } from "./fixtures";

installCommerceTestEnvironment();

describe("platform liability route contracts", () => {
    test("refreshes through one exact RPC and preserves the complete DTO", async () => {
        setRestResponder(() => Response.json(controlResponse));

        const response = await requestCommerce("/system/platform-payout-liability/refresh", {
            body: { reason: "  scheduled reconciliation  " },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(controlResponse);
        expect(expectSingleRpc("refresh_platform_payout_liability").body).toEqual({
            p_calculation_reason: "scheduled reconciliation",
            p_included_prospective_order_id: null,
        });
    });

    test("defaults an empty refresh reason without adding a call", async () => {
        setRestResponder(() => Response.json(controlResponse));

        const response = await requestCommerce("/system/platform-payout-liability/refresh", {
            body: { reason: "   " },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("refresh_platform_payout_liability").body).toEqual({
            p_calculation_reason: "Scheduled platform liability and risk-window refresh",
            p_included_prospective_order_id: null,
        });
    });

    test("returns the exact nested pending authorization projection", async () => {
        setRestResponder(() =>
            Response.json({
                runKey: "liability-run-7",
                control: authorizedControlResponse,
                authorizations: [
                    {
                        liabilityRevision: 7,
                        requiredMinimumAmount: 1_800,
                        decreaseAuthorizationId: "11111111-1111-4111-8111-111111111111",
                        changeDirection: "decrease",
                    },
                ],
            }),
        );

        const response = await requestCommerce("/system/platform-payout-liability/pending", {
            body: { runKey: "  liability-run-7  " },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            runKey: "liability-run-7",
            control: authorizedControlResponse,
            authorizations: [
                {
                    liabilityRevision: 7,
                    requiredMinimumAmount: 1_800,
                    decreaseAuthorizationId: "11111111-1111-4111-8111-111111111111",
                    changeDirection: "decrease",
                },
            ],
        });
        expect(expectSingleRpc("pending_platform_payout_liability_authorizations").body).toEqual({
            p_run_key: "liability-run-7",
        });
    });

    test("authorizes a decrease with trusted admin identity and one RPC", async () => {
        setRestResponder(() => Response.json(authorizedControlResponse));

        const response = await requestCommerce("/admin/platform-payout-liability/authorize-decrease", {
            userId: "admin-5",
            body: { expectedLiabilityRevision: "7", reason: "  reviewed decrease  " },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(authorizedControlResponse);
        expect(expectSingleRpc("authorize_platform_payout_liability_decrease").body).toEqual({
            p_expected_liability_revision: 7,
            p_actor_id: "admin-5",
            p_reason: "reviewed decrease",
        });
    });

    test("records the exact accepted provider receipt", async () => {
        setRestResponder(() =>
            Response.json({
                accepted: true,
                needsReapply: false,
                liabilityRevision: 7,
                requiredMinimumAmount: 1_800,
                lastProviderAppliedAmount: 1_800,
            }),
        );

        const response = await requestCommerce("/system/platform-payout-liability/applied", {
            body: {
                liabilityRevision: "7",
                appliedMinimumAmount: "1800",
                decreaseAuthorizationId: "  11111111-1111-4111-8111-111111111111  ",
            },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            accepted: true,
            needsReapply: false,
            liabilityRevision: 7,
            requiredMinimumAmount: 1_800,
            lastProviderAppliedAmount: 1_800,
        });
        expect(expectSingleRpc("record_platform_payout_liability_applied").body).toEqual({
            p_liability_revision: 7,
            p_applied_minimum_amount: 1_800,
            p_decrease_authorization_id: "11111111-1111-4111-8111-111111111111",
        });
    });

    test("preserves the stale receipt shape with its nested current control", async () => {
        setRestResponder(() =>
            Response.json({
                accepted: false,
                needsReapply: true,
                control: controlResponse,
            }),
        );

        const response = await requestCommerce("/system/platform-payout-liability/applied", {
            body: { liabilityRevision: 6, appliedMinimumAmount: 2_000 },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            accepted: false,
            needsReapply: true,
            control: controlResponse,
        });
        expect(expectSingleRpc("record_platform_payout_liability_applied").body).toEqual({
            p_liability_revision: 6,
            p_applied_minimum_amount: 2_000,
            p_decrease_authorization_id: null,
        });
    });

    test("prepares payment through the legal preflight and preserves every current field", async () => {
        setRestResponder((request) =>
            request.url.endsWith("/rpc/get_buyer_legal_verification_context")
                ? Response.json({
                      enabled: false,
                      paymentAlreadyCreated: false,
                      documents: [],
                  })
                : Response.json(preparedPaymentResponse),
        );

        const response = await requestCommerce("/me/order/payment/prepare", {
            userId: "buyer-17",
            body: { orderId: "42", sellerId: "spoofed", amount: 1 },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(preparedPaymentResponse);
        expect(expectRpc("prepare_protected_payment").body).toMatchObject({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
            p_accepted_legal_document_version_ids: [],
            p_payment_provider: "stripe",
            p_verified_legal_documents: [],
        });
    });
});
