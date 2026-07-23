import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";
import type { PaymentCreationState } from "./index";

export async function assertCheckoutReplay(
    { fn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    { paymentBody, recordPaymentBody }: PaymentCreationState,
): Promise<void> {
    // A browser reload deliberately calls the idempotent provider endpoint again so it can
    // recover the existing client secret. Commerce projection identity must follow the
    // returned provider snapshot: the exact same snapshot is an idempotent replay, while a
    // later provider sync for that same PaymentIntent is a distinct projection event.
    const projectionClaims = new Map<string, string>();
    const initialProjection = recordPaymentBody as Record<string, unknown>;
    projectionClaims.set(String(initialProjection.providerEventId), JSON.stringify(initialProjection));
    const replayProviderBodies: unknown[] = [];
    const replayProjectionBodies: Array<Record<string, unknown>> = [];
    const runCheckoutReplay = async (updatedAt: string, commercePaymentStatus = "requires_action") =>
        executeFunction(
            fn,
            new Request("https://cms.test/functions/createPaymentForOrder", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId: 42 }),
            }),
            {
                sources,
                identities,
                user: { id: "buyer-subject", role: "user" },
                deps: {
                    identities,
                    fetchImpl: async (input, init) => {
                        const request = new Request(input, init);
                        if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                            return Response.json({
                                sellerCmsUserId: "seller-subject",
                                buyerCmsUserId: "buyer-subject",
                            });
                        }
                        if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                            return Response.json({ eligible: true, reasonCode: "eligible" });
                        }
                        if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                            return Response.json({
                                sellerId: 17,
                                capabilityKey: "protected_payment",
                                ready: true,
                                confirmedAt: "2026-07-23T12:00:00.000Z",
                                revokedAt: null,
                            });
                        }
                        if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                            return Response.json({
                                orderId: 42,
                                orderPublicId: "order-public-42",
                                orderNumber: "ORDER-42",
                                sellerId: "seller-subject",
                                buyerTotalAmount: 2500,
                                sellerProceedsAmount: 2250,
                                sellerTransferReleaseAmount: 2050,
                                sellerReserveLiabilityAmount: 200,
                                currency: "EUR",
                                financialTermsHash: "terms_hash_42",
                                financialRevision: 3,
                                protectionRequired: true,
                                payoutDelayDays: 14,
                                dualApprovalThresholdAmount: 1000,
                                sellerRequiredMinimumBalanceAmount: 0,
                                platformRequiredMinimumBalanceAmount: 2250,
                                platformLiabilityRevision: 7,
                                platformPayoutDecreaseAuthorizationId: null,
                                platformPayoutChangeDirection: "increase",
                            });
                        }
                        if (request.url.startsWith("https://commerce.test/payment/record")) {
                            const projection = (await request.json()) as Record<string, unknown>;
                            replayProjectionBodies.push(projection);
                            const eventId = String(projection.providerEventId);
                            const payload = JSON.stringify(projection);
                            const claimed = projectionClaims.get(eventId);
                            if (claimed !== undefined && claimed !== payload) {
                                return Response.json(
                                    { error: "provider event replay changed canonical payload" },
                                    { status: 409 },
                                );
                            }
                            projectionClaims.set(eventId, payload);
                            return Response.json({
                                paymentStatus: "requires_action",
                                settlementStatus: "held",
                                idempotentReplay: claimed !== undefined,
                            });
                        }
                        if (request.url.startsWith("https://stripe.test/payout/platform")) {
                            return Response.json({
                                liabilityRevision: 7,
                                appliedMinimumBalanceEur: 2250,
                                decreaseAuthorizationId: null,
                                payoutControl: { interval: "manual" },
                            });
                        }
                        if (request.url.startsWith("https://commerce.test/recordPlatformPayoutLiabilityApplied")) {
                            return Response.json({ accepted: true, needsReapply: false });
                        }
                        const providerBody = await request.json();
                        replayProviderBodies.push(providerBody);
                        return Response.json({
                            paymentId: 9,
                            stripePaymentIntentId: "pi_9",
                            clientSecret: "pi_9_secret_test",
                            clientReferenceId: "order-public-42",
                            paymentStatus: "requires_action",
                            commercePaymentStatus,
                            settlementStatus: commercePaymentStatus === "manual_review" ? "manual_review" : "held",
                            ...(commercePaymentStatus === "manual_review"
                                ? { manualReviewReason: "Provider truth is awaiting reconciliation" }
                                : {}),
                            disputeStatus: "none",
                            refundedAmount: 0,
                            transferredAmount: 0,
                            reversedAmount: 0,
                            sellerTransferAmount: 2250,
                            platformRetainedAmount: 250,
                            amountTotal: 2500,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            updatedAt,
                        });
                    },
                },
            },
        );

    const exactReplay = await runCheckoutReplay("2026-07-13T00:00:00.000Z");
    const laterSyncReplay = await runCheckoutReplay("2026-07-13T00:01:00.000Z");
    const manualReviewReplay = await runCheckoutReplay("2026-07-13T00:02:00.000Z", "manual_review");
    expect(exactReplay.status).toBe(200);
    expect(laterSyncReplay.status).toBe(200);
    expect(manualReviewReplay.status).toBe(200);
    expect((await exactReplay.json()).clientSecret).toBe("pi_9_secret_test");
    expect((await laterSyncReplay.json()).clientSecret).toBe("pi_9_secret_test");
    expect(await manualReviewReplay.json()).toMatchObject({
        status: "manual_review",
        paymentStatus: "requires_action",
        commercePaymentStatus: "manual_review",
        settlementStatus: "manual_review",
    });
    expect(replayProviderBodies).toEqual([paymentBody, paymentBody, paymentBody]);
    expect(replayProjectionBodies.map((body) => body.providerEventId)).toEqual([
        "payment-checkout-sync:9:2026-07-13T00:00:00.000Z",
        "payment-checkout-sync:9:2026-07-13T00:01:00.000Z",
        "payment-checkout-sync:9:2026-07-13T00:02:00.000Z",
    ]);
    expect(replayProjectionBodies[2]?.status).toBe("manual_review");
    expect(replayProjectionBodies[2]?.providerSnapshot).toMatchObject({
        paymentStatus: "requires_action",
        commercePaymentStatus: "manual_review",
        settlementStatus: "manual_review",
        manualReviewReason: "Provider truth is awaiting reconciliation",
        transferredAmount: 0,
        reversedAmount: 0,
    });
    expect(projectionClaims.size).toBe(3);
}
