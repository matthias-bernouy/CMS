import { expect } from "bun:test";
import { USER_ROLE } from "@bernouy/cms-permissions";
import type { IntegrationContractContext } from "./harness";

export async function assertBlocContracts({ roles, importedBlocs }: IntegrationContractContext): Promise<void> {
    expect((await roles.get(USER_ROLE))?.grants.map((grant) => grant.permission)).toEqual(
        expect.arrayContaining([
            "urn:system-functions:createPaymentForOrder",
            "urn:system-functions:getStripePaymentClientConfig",
            "urn:system-functions:getPaymentForOrder",
            "urn:system-functions:refreshPaymentForOrder",
            "urn:system-functions:getSellerSaleEnrollment",
            "urn:system-functions:submitSellerOfferPrice",
            "urn:system-functions:createProtectedOrder",
        ]),
    );
    expect(importedBlocs[0]?.viewJS).toContain("confirmPayment");
    expect(importedBlocs[0]?.viewJS).toContain("createPaymentForOrder");
    expect(importedBlocs[0]?.viewJS).toContain("refreshPaymentForOrder");
    expect(importedBlocs[0]?.viewJS).toContain("refreshPaymentUntilSettled");
    expect(importedBlocs[0]?.viewJS).toContain("PAYMENT_RECONCILIATION_POLL_TIMEOUT_MS = 60_000");
    expect(importedBlocs[0]?.viewJS).toContain("payment?.reconciliationPending === true");
    expect(importedBlocs[0]?.viewJS).not.toContain("manualReviewReason");
    expect(importedBlocs[0]?.viewJS).not.toContain("charge_balance_transaction_expansion");
    expect(importedBlocs[0]?.viewJS).toContain('!["blocked", "reversed"].includes(settlement)');
    expect(importedBlocs[0]?.viewJS).toContain("this.paymentSubmissionLocked = true");
    expect(importedBlocs[0]?.viewJS).toContain("this.paymentSubmissionLocked || !currentFormIsUsable");
    const transientReconciliationBranch =
        importedBlocs[0]?.viewJS.indexOf("if (payment?.reconciliationPending === true") ?? -1;
    const manualReviewBranch = importedBlocs[0]?.viewJS.indexOf('if (settlement === "manual_review")') ?? -1;
    const disputeBranch =
        importedBlocs[0]?.viewJS.indexOf('if (["open", "under_review", "lost"].includes(dispute))') ?? -1;
    expect(disputeBranch).toBeGreaterThanOrEqual(0);
    expect(transientReconciliationBranch).toBeGreaterThan(disputeBranch);
    expect(manualReviewBranch).toBeGreaterThan(transientReconciliationBranch);
    expect(importedBlocs[0]?.viewJS).toContain("SELLER_PROTECTED_PAYMENT_NOT_READY");
    expect(importedBlocs[0]?.viewJS).toContain("Cette annonce n’est pas disponible à l’achat pour le moment");
    expect(importedBlocs[0]?.viewJS).toContain("protectedPaymentState");
    expect(importedBlocs[0]?.viewJS).toContain("payment?.settlementStatus");
    expect(importedBlocs[0]?.viewJS).toContain("payment?.disputeStatus");
    expect(importedBlocs[0]?.viewJS).toContain("payment?.refundedAmount");
    expect(importedBlocs[0]?.viewJS).not.toContain('paymentIntent?.status === "succeeded"');
    expect(importedBlocs[0]?.viewJS).toContain("paymentElementReady");
    expect(importedBlocs[0]?.viewJS).toContain('element.on("ready"');
    expect(importedBlocs[0]?.viewJS).toContain('element.on("loaderror"');
    expect(importedBlocs[0]?.viewJS).toContain("waitUntilVisible");
    expect(importedBlocs[0]?.viewJS).toContain("stableFrames >= 2");
    expect(importedBlocs[0]?.viewJS).toContain("wallets: { link: this.linkWallet() }");
    expect(importedBlocs[0]?.viewJS).toContain('this.getAttribute("link-wallet") === "auto" ? "auto" : "never"');
    expect(atob(importedBlocs[0]?.source?.["default.html"] ?? "")).toContain('link-wallet="never"');
    expect(importedBlocs[0]?.viewJS).not.toContain("if (isVisible(element)) return Promise.resolve()");
    expect(importedBlocs[0]?.viewJS).toContain("mount.slot = PAYMENT_ELEMENT_SLOT");
    expect(importedBlocs[0]?.viewJS).toContain('<slot name="stripe-payment-element"></slot>');
    expect(importedBlocs[0]?.viewJS).toContain('slot[name="stripe-payment-element"]');
    expect(importedBlocs[0]?.viewJS).toContain("min-width: 0;");
    expect(importedBlocs[0]?.viewJS).not.toContain("<div data-payment-element></div>");
    expect(importedBlocs[0]?.viewJS).toContain("--primary-base");
    expect(importedBlocs[0]?.viewJS).not.toContain("seller-user-id");
    expect(importedBlocs[0]?.viewJS).not.toContain("amount-total");
    expect(importedBlocs[0]?.viewJS).not.toContain("application-fee-amount");
    expect(importedBlocs[0]?.viewJS).toContain('this.dispatch("refund"');
    expect(importedBlocs[0]?.viewJS).toContain('this.dispatch("blocked"');
    expect(importedBlocs[0]?.viewJS).not.toContain("🔒");
    expect(importedBlocs[0]?.viewJS).toContain("<svg");
    expect(importedBlocs[0]?.editorJS).toContain('type: "color"');
}
