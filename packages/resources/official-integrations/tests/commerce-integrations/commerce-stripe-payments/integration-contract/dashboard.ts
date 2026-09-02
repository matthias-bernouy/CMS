import { expect } from "bun:test";
import { dashboardViewAsLegacyDashboard, validateDashboard } from "@bernouy/cms-dashboards";
import { validateFunction } from "@bernouy/cms-functions";
import { validateTrigger } from "@bernouy/cms-triggers";
import type { IntegrationContractContext } from "./harness";

export async function assertDashboardContracts({
    dashboards,
    dashboardViews,
    sources,
    triggers,
    enrollmentFn,
    submitPriceFn,
    protectedOrderFn,
}: IntegrationContractContext): Promise<void> {
    const operationsView = await dashboardViews.getView("commerce-stripe-payments-operations");
    const operationsDashboard = operationsView ? dashboardViewAsLegacyDashboard(operationsView) : null;
    expect(operationsDashboard).not.toBeNull();
    expect(validateDashboard(operationsDashboard!, { source: (await sources.getSource("urn:commerce"))! })).toEqual([]);
    const operationsDashboardJSON = JSON.stringify(operationsDashboard);
    expect(operationsDashboardJSON).toContain("providerPaymentsTable");
    expect(operationsDashboardJSON).toContain("providerFinancialOperationsTable");
    expect(operationsDashboardJSON).toContain("actualStripeProcessingFeeAmount");
    expect(operationsDashboardJSON).toContain("actualPlatformMarginAfterStripeAmount");
    expect(operationsDashboardJSON).toContain("dualApprovalRequired");
    expect(operationsDashboardJSON).toContain("firstApprovedBy");
    expect(operationsDashboardJSON).toContain("downloadClaimEvidence");
    const dashboardTabs = (operationsDashboard as any)?.views?.[0]?.tabs ?? [];
    const claimsTab = dashboardTabs.find((tab: any) => tab.id === "claims");
    const paymentsTab = dashboardTabs.find((tab: any) => tab.id === "payments");
    const refundsTab = dashboardTabs.find((tab: any) => tab.id === "refunds");
    const disputesTab = dashboardTabs.find((tab: any) => tab.id === "stripeDisputes");
    expect(claimsTab?.children?.map((child: any) => child.id)).toEqual(
        expect.arrayContaining(["claimsTable", "claimDetail", "claimEvidenceTable", "claimEvidenceDetail"]),
    );
    const claimEvidenceTable = claimsTab?.children?.find((child: any) => child.id === "claimEvidenceTable");
    expect(claimEvidenceTable?.source?.params?.claimId).toBe("$selection.claimDetail.id");
    expect(paymentsTab?.children?.map((child: any) => child.id)).not.toContain("claimEvidenceTable");
    const sectionFieldPaths = (detail: any, sectionId: string) =>
        detail?.main?.find((section: any) => section.id === sectionId)?.fields?.map((field: any) => field.path) ?? [];
    const protectedPaymentDetail = paymentsTab?.children?.find((child: any) => child.id === "protectedPaymentDetail");
    expect(protectedPaymentDetail?.main?.map((section: any) => section.id)).toEqual(
        expect.arrayContaining(["immutableFinancialSnapshot", "settlementLedgerSnapshot", "protectedPaymentTimelines"]),
    );
    expect(sectionFieldPaths(protectedPaymentDetail, "immutableFinancialSnapshot")).toEqual(
        expect.arrayContaining([
            "financialTerms.shippingAmount",
            "financialTerms.estimatedStripeCostAmount",
            "financialTerms.estimatedCarrierCostAmount",
            "financialTerms.expectedPlatformMarginAmount",
            "financialTerms.feePolicySnapshot",
            "financialTerms.protectionPolicySnapshot",
            "financialTerms.sellerRiskPolicySnapshot",
            "financialTerms",
        ]),
    );
    expect(sectionFieldPaths(protectedPaymentDetail, "settlementLedgerSnapshot")).toEqual(
        expect.arrayContaining([
            "settlement.totalTransferredAmount",
            "settlement.totalReversedAmount",
            "settlement.totalRefundedAmount",
            "settlement.sellerReserveLiabilityRemainingAmount",
            "settlement",
        ]),
    );
    expect(sectionFieldPaths(protectedPaymentDetail, "protectedPaymentTimelines")).toEqual(
        expect.arrayContaining([
            "paymentAttempts",
            "fulfillment",
            "claims",
            "refundRequests",
            "stripeDisputes",
            "auditEvents",
        ]),
    );
    expect(
        protectedPaymentDetail?.main?.find((section: any) => section.id === "immutableFinancialSnapshot")?.description,
    ).toContain("policy estimates, not provider expenses");
    const refundRequestDetail = refundsTab?.children?.find((child: any) => child.id === "refundRequestDetail");
    expect(refundRequestDetail?.main?.map((section: any) => section.id)).toEqual(
        expect.arrayContaining(["stripeBuyerRefundFacts", "sellerTransferRecoveryFacts"]),
    );
    expect(sectionFieldPaths(refundRequestDetail, "stripeBuyerRefundFacts")).toEqual(
        expect.arrayContaining([
            "providerSnapshot.id",
            "providerSnapshot.status",
            "providerSnapshot.balanceTransaction.id",
            "providerSnapshot.balanceTransaction.amount",
            "providerSnapshot.balanceTransaction.fee",
            "providerSnapshot.balanceTransaction.net",
            "providerSnapshot",
        ]),
    );
    expect(sectionFieldPaths(refundRequestDetail, "sellerTransferRecoveryFacts")).toEqual(
        expect.arrayContaining(["sellerRecoveryAmount", "sellerReserveOffsetAmount", "businessKey", "claimId"]),
    );
    expect(sectionFieldPaths(refundRequestDetail, "refundState")).not.toContain("sellerRecoveryAmount");
    const stripeDisputeDetail = disputesTab?.children?.find((child: any) => child.id === "stripeDisputeDetail");
    expect(sectionFieldPaths(stripeDisputeDetail, "disputeProviderBalanceImpact")).toEqual(
        expect.arrayContaining([
            "fundsWithdrawn",
            "balanceTransactionIds",
            "stripeChargeId",
            "providerPaymentId",
            "clientReferenceId",
        ]),
    );
    const stripeDisputesTable = disputesTab?.children?.find((child: any) => child.id === "stripeDisputesTable");
    expect(stripeDisputesTable?.columns?.map((column: any) => column.path)).toContain("fundsWithdrawn");
    expect(operationsDashboardJSON).not.toContain("manualPayment");
    expect(operationsDashboardJSON).not.toContain("sellerList");
    expect(validateTrigger((await triggers.getTrigger("execute-authorized-settlement-release"))!)).toEqual([]);
    for (const triggerId of [
        "execute-requested-order-refund",
        "execute-reviewed-order-refund",
        "execute-claim-resolution-refund",
        "execute-buyer-cancellation-refund",
        "execute-seller-cancellation-refund",
        "execute-reviewed-cancellation-refund",
        "execute-buyer-payment-cancellation",
        "execute-seller-payment-cancellation",
        "execute-reviewed-payment-cancellation",
    ]) {
        expect(validateTrigger((await triggers.getTrigger(triggerId))!)).toEqual([]);
    }
    expect(await validateFunction(enrollmentFn, { sources })).toEqual([]);
    expect(await validateFunction(submitPriceFn, { sources })).toEqual([]);
    expect(await validateFunction(protectedOrderFn, { sources })).toEqual([]);
}
