import { expect, test } from "bun:test";
import { financialTermsHash } from "../runtime/constants";
import type { StripeConnectHarness } from "../runtime/harness";
import { okJson } from "../runtime/http";
import { sourceJson, sourceRequestWithRole } from "../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerFinancialOperationRedactionScenario(createHarness: CreateHarness): void {
    test("recursively redacts provider secrets from listed financial operations", async () => {
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
        await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "redacted-operation-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );

        const listed = await sourceRequestWithRole(harness, "admin-1", "admin", "listFinancialOperations");
        const serialized = JSON.stringify(await okJson(listed));
        expect(serialized).not.toContain("client_secret");
        expect(serialized).not.toContain("clientSecret");
        expect(serialized).not.toContain("pi_1_secret");
    });
}
