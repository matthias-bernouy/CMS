import type { ConnectAccountRow } from "../../../db/records/accounts.ts";
import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import { getPaymentByClientReference, reserveProtectedPayment } from "../../../db/repositories/payments.ts";
import { sellerCanAcceptHeldPayments } from "../../../domain/accounts/eligibility.ts";
import { publicPaymentWithClientSecret } from "../../../domain/payments/presentation.ts";
import { HttpError } from "../../../http/errors.ts";
import { digest } from "../../../shared/crypto.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { syncPaymentWithClientSecret } from "../projection.ts";
import { executeProtectedPaymentIntentCreation } from "./operation.ts";
import { assertPlatformPayoutProtection } from "./platform-protection.ts";
import { assertPaymentReplay, protectedPaymentTermsFromBody } from "./terms.ts";

type ProtectedPaymentWorkflowDependencies = {
    syncAccountForIdentity(identity: string): Promise<ConnectAccountRow | null>;
};

export type CreateProtectedPaymentForBuyer = (buyerUserId: string, body: JsonRecord) => Promise<JsonRecord>;

export function createProtectedPaymentWorkflow({
    syncAccountForIdentity,
}: ProtectedPaymentWorkflowDependencies): CreateProtectedPaymentForBuyer {
    return async function createProtectedPaymentForBuyer(buyerUserId, body) {
        const terms = protectedPaymentTermsFromBody(body);
        const seller = await syncAccountForIdentity(terms.sellerIdentity);
        if (!seller?.stripe_account_id || !sellerCanAcceptHeldPayments(seller)) {
            throw new HttpError(409, "seller enrollment does not allow a held platform payment");
        }
        const sellerUserId = seller.cms_user_id;
        if (sellerUserId === buyerUserId) {
            throw new HttpError(400, "buyer and seller must be different users");
        }

        const expectedTerms = {
            buyerUserId,
            sellerUserId,
            sellerStripeAccountId: seller.stripe_account_id,
            amountTotal: terms.amountTotal,
            sellerTransferAmount: terms.sellerTransferAmount,
            currency: terms.currency,
            financialTermsHash: terms.financialTermsHash,
            financialRevision: terms.financialRevision,
            dualApprovalThresholdAmount: terms.dualApprovalThresholdAmount,
        };
        const existing = await getPaymentByClientReference(terms.clientReferenceId);
        if (existing) {
            assertPaymentReplay(existing, expectedTerms);
            if (existing.payment_status !== "succeeded") {
                await assertPlatformPayoutProtection();
            }
            const synced = await syncPaymentWithClientSecret(existing);
            return publicPaymentWithClientSecret(synced.payment, synced.clientSecret);
        }

        await assertPlatformPayoutProtection();

        const transferGroup = `cms_order_${await digest(terms.clientReferenceId)}`;
        let payment: ConnectPaymentRow;
        try {
            payment = await reserveProtectedPayment({
                client_reference_id: terms.clientReferenceId,
                financial_terms_hash: terms.financialTermsHash,
                financial_revision: terms.financialRevision,
                dual_approval_threshold_amount: terms.dualApprovalThresholdAmount,
                buyer_cms_user_id: buyerUserId,
                seller_cms_user_id: sellerUserId,
                seller_stripe_account_id: seller.stripe_account_id,
                transfer_group: transferGroup,
                currency: terms.currency,
                amount_total: terms.amountTotal,
                seller_transfer_amount: terms.sellerTransferAmount,
                platform_retained_amount: terms.amountTotal - terms.sellerTransferAmount,
                payment_status: "created",
                settlement_status: "held",
                description: terms.description,
            });
            assertPaymentReplay(payment, expectedTerms);
        } catch (error) {
            const raced = await getPaymentByClientReference(terms.clientReferenceId);
            if (!raced) {
                throw error;
            }
            assertPaymentReplay(raced, expectedTerms);
            payment = raced;
        }

        if (payment.stripe_payment_intent_id) {
            const synced = await syncPaymentWithClientSecret(payment);
            return publicPaymentWithClientSecret(synced.payment, synced.clientSecret);
        }

        return await executeProtectedPaymentIntentCreation(payment, {
            amountTotal: terms.amountTotal,
            currency: terms.currency,
            clientReferenceId: terms.clientReferenceId,
            financialTermsHash: terms.financialTermsHash,
            transferGroup,
        });
    };
}
