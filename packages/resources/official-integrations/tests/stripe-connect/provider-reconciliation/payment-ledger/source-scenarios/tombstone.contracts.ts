import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../runtime/constants";
import { okJson } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import type { CreatePaymentRecoveryScenarioHarness } from "./harness";

export function registerAbsentPaymentTombstoneScenario(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    test("tombstones an absent provider payment and permanently rejects a later create race", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );

        const first = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-before-provider-create",
                cancellationRequestId: "commerce-cancellation-absent-1",
                reason: "buyer cancelled before the provider payment existed",
            }),
        );
        const replay = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-before-provider-create",
                cancellationRequestId: "commerce-cancellation-absent-1",
                reason: "buyer cancelled before the provider payment existed",
            }),
        );
        const lateCreate = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "cancel-before-provider-create",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });

        expect(first).toMatchObject({
            cancellationRequestId: "commerce-cancellation-absent-1",
            providerStatus: "absent",
            providerPaymentAbsent: true,
            providerEventId: "payment-cancellation-absent:commerce-cancellation-absent-1",
        });
        expect(replay).toEqual(first);
        expect(lateCreate.status).toBe(409);
        expect(harness.rest.rows("payments")).toHaveLength(0);
        expect(harness.rest.rows("financial_operations")).toHaveLength(0);
        expect(harness.rest.rows("payment_lifecycle_guards")).toEqual([
            expect.objectContaining({
                client_reference_id: "cancel-before-provider-create",
                payment_id: null,
                cancellation_request_id: "commerce-cancellation-absent-1",
            }),
        ]);
    });
}
