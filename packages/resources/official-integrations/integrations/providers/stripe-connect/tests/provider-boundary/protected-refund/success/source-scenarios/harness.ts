import { financialTermsHash } from "../../../../runtime/constants";
import type { StripeConnectHarness } from "../../../../runtime/harness";
import { okJson } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../runtime/types";

export type CreateProtectedRefundSourceHarness = () => Promise<StripeConnectHarness>;

export async function createPaidPaymentWithReleases(
    createHarness: CreateProtectedRefundSourceHarness,
    clientReferenceId: string,
    releases: Array<{ id: string; kind: "initial" | "reserve"; amount: number }>,
): Promise<{ harness: StripeConnectHarness; created: JsonRecord }> {
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
            clientReferenceId,
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        }),
    );
    harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
    await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
    for (const release of releases) {
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: release.id,
                releaseKind: release.kind,
                amount: release.amount,
                currency: "eur",
            }),
        );
    }
    return { harness, created };
}
