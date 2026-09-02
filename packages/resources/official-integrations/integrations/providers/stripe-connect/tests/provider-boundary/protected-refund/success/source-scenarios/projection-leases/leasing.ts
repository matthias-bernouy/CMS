import { expect } from "bun:test";
import { financialTermsHash } from "../../../../../runtime/constants";
import type { StripeConnectHarness } from "../../../../../runtime/harness";
import { okJson } from "../../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../../runtime/types";
import type { CreateProtectedRefundSourceHarness } from "../harness";

export async function verifyProjectionLeaseRecovery(
    createHarness: CreateProtectedRefundSourceHarness,
): Promise<{ harness: StripeConnectHarness; paymentId: number }> {
    const harness = await createHarness();
    await okJson(
        await sourceJson(
            harness,
            "createConnectOnboardingSessionForUser",
            { email: "seller@example.com" },
            { userId: "seller-1" },
        ),
    );
    const created = await okJson(
        await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "order-projection-outbox",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        }),
    );
    const paymentId = Number(created.paymentId);
    harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
    await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(paymentId) }));

    const firstRun = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-lost-ack-1",
            limit: 1,
        }),
    );
    const firstLease = (firstRun.payments as JsonRecord[])[0]!;
    expect(firstLease.occurredAt).toBe(firstLease.updatedAt);
    harness.rest.expireProjectionLease(Number(firstLease.projectionId));
    const reclaimedRun = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-lost-ack-2",
            limit: 1,
        }),
    );
    const reclaimed = (reclaimedRun.payments as JsonRecord[])[0]!;
    expect(reclaimed).toMatchObject({
        projectionId: firstLease.projectionId,
        projectionAttemptCount: 2,
    });
    expect(reclaimed.projectionClaimToken).not.toBe(firstLease.projectionClaimToken);
    await okJson(
        await sourceJson(harness, "acknowledgeCommerceProjection", {
            projectionId: reclaimed.projectionId,
            claimToken: reclaimed.projectionClaimToken,
        }),
    );
    const remainingInitial = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-lost-ack-drain",
            limit: 5,
        }),
    );
    for (const projection of remainingInitial.payments as JsonRecord[]) {
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: projection.projectionId,
                claimToken: projection.projectionClaimToken,
            }),
        );
    }

    for (let index = 0; index < 7; index++) {
        harness.rest.seedPaymentProjection(paymentId, `test:payment:backlog:${index}`);
    }
    const backlogOne = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-backlog-1",
            limit: 5,
        }),
    );
    expect(backlogOne.payments).toHaveLength(5);
    for (const projection of backlogOne.payments as JsonRecord[]) {
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: projection.projectionId,
                claimToken: projection.projectionClaimToken,
            }),
        );
    }
    const backlogTwo = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-backlog-2",
            limit: 5,
        }),
    );
    expect(backlogTwo.payments).toHaveLength(2);
    for (const projection of backlogTwo.payments as JsonRecord[]) {
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: projection.projectionId,
                claimToken: projection.projectionClaimToken,
            }),
        );
    }
    return { harness, paymentId };
}
