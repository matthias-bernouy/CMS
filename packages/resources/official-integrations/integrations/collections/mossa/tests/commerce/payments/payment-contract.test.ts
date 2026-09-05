import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Mossa Stripe payment block", () => {
    test("keeps the protected payment UI contract explicit", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "mossa-commerce-stripe-payment",
        );
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS || !artifact.bloc.editorJS) {
            throw new Error("Mossa Stripe payment block not found");
        }

        expect(artifact.bloc?.viewJS).toContain("confirmPayment");
        expect(artifact.bloc?.viewJS).toContain("createPaymentForOrder");
        expect(artifact.bloc?.viewJS).toContain("getPaymentLegalRequirements");
        expect(artifact.bloc?.viewJS).toContain("acceptedLegalDocumentVersionIds");
        expect(artifact.bloc?.viewJS).toContain("renderLegalRequirements");
        expect(artifact.bloc?.viewJS).toContain("refreshPaymentForOrder");
        expect(artifact.bloc?.viewJS).toContain("refreshPaymentUntilSettled");
        expect(artifact.bloc?.viewJS).toContain("PAYMENT_RECONCILIATION_POLL_TIMEOUT_MS = 60_000");
        expect(artifact.bloc?.viewJS).toContain("payment?.reconciliationPending === true");
        expect(artifact.bloc?.viewJS).not.toContain("manualReviewReason");
        expect(artifact.bloc?.viewJS).not.toContain("charge_balance_transaction_expansion");
        expect(artifact.bloc?.viewJS).toContain('!["blocked", "reversed"].includes(settlement)');
        expect(artifact.bloc?.viewJS).toContain("this.paymentSubmissionLocked = true");
        expect(artifact.bloc?.viewJS).toContain(
            "this.paymentSubmissionLocked || (!currentFormIsUsable && !legalAcceptanceCanRetry)",
        );
        const transientReconciliationBranch =
            artifact.bloc?.viewJS.indexOf("if (payment?.reconciliationPending === true") ?? -1;
        const manualReviewBranch = artifact.bloc?.viewJS.indexOf('if (settlement === "manual_review")') ?? -1;
        const disputeBranch =
            artifact.bloc?.viewJS.indexOf('if (["open", "under_review", "lost"].includes(dispute))') ?? -1;
        expect(disputeBranch).toBeGreaterThanOrEqual(0);
        expect(transientReconciliationBranch).toBeGreaterThan(disputeBranch);
        expect(manualReviewBranch).toBeGreaterThan(transientReconciliationBranch);
        expect(artifact.bloc?.viewJS).toContain("SELLER_PROTECTED_PAYMENT_NOT_READY");
        expect(atob(artifact.bloc?.source?.["copy.ts"] ?? "")).toContain(
            "This offer is not currently available for purchase",
        );
        expect(artifact.bloc?.viewJS).toContain("protectedPaymentState");
        expect(artifact.bloc?.viewJS).toContain("payment?.settlementStatus");
        expect(artifact.bloc?.viewJS).toContain("payment?.disputeStatus");
        expect(artifact.bloc?.viewJS).toContain("payment?.refundedAmount");
        expect(artifact.bloc?.viewJS).not.toContain('paymentIntent?.status === "succeeded"');
        expect(artifact.bloc?.viewJS).toContain("paymentElementReady");
        expect(artifact.bloc?.viewJS).toContain('element.on("ready"');
        expect(artifact.bloc?.viewJS).toContain('element.on("loaderror"');
        expect(artifact.bloc?.viewJS).toContain("waitUntilVisible");
        expect(artifact.bloc?.viewJS).toContain("stableFrames >= 2");
        expect(artifact.bloc?.viewJS).toContain("wallets: { link: this.linkWallet() }");
        expect(artifact.bloc?.viewJS).toContain('this.getAttribute("link-wallet") === "auto" ? "auto" : "never"');
        expect(atob(artifact.bloc?.source?.["default.html"] ?? "")).toContain('link-wallet="never"');
        expect(artifact.bloc?.viewJS).not.toContain("if (isVisible(element)) return Promise.resolve()");
        expect(artifact.bloc?.viewJS).toContain("mount.slot = PAYMENT_ELEMENT_SLOT");
        expect(artifact.bloc?.viewJS).toContain('<slot name="stripe-payment-element"></slot>');
        expect(artifact.bloc?.viewJS).toContain('slot[name="stripe-payment-element"]');
        expect(artifact.bloc?.viewJS).toContain("min-width: 0;");
        expect(artifact.bloc?.viewJS).not.toContain("<div data-payment-element></div>");
        expect(artifact.bloc?.viewJS).toContain("--ulvia-primary-base");
        expect(artifact.bloc?.viewJS).not.toContain('getAttribute("accent-color")');
        expect(artifact.bloc?.viewJS).not.toContain('getAttribute("text-color")');
        expect(artifact.bloc?.viewJS).not.toContain("seller-user-id");
        expect(artifact.bloc?.viewJS).not.toContain("amount-total");
        expect(artifact.bloc?.viewJS).not.toContain("application-fee-amount");
        expect(artifact.bloc?.viewJS).toContain('this.dispatch("refund"');
        expect(artifact.bloc?.viewJS).toContain('this.dispatch("blocked"');
        expect(artifact.bloc?.viewJS).not.toContain("🔒");
        expect(artifact.bloc?.viewJS).toContain("<svg");
        expect(artifact.bloc?.editorJS).not.toContain('type: "color"');
        expect(artifact.bloc?.editorJS).toContain('attribute: "legal-appearance"');
        expect(artifact.bloc?.editorJS).toContain('defaultValue: "detailed"');
    });
});
