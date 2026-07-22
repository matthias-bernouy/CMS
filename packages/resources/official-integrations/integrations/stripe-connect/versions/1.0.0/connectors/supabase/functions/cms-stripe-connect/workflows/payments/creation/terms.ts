import type { ConnectPaymentRow } from "../../../db/records/payments.ts";
import {
    assertAllowedKeys,
    optionalCurrency,
    optionalPositiveInteger,
    optionalText,
    requiredHash,
    requiredInteger,
    requiredString,
} from "../../../http/body.ts";
import { HttpError } from "../../../http/errors.ts";
import { defaultCurrency } from "../../../shared/runtime.ts";
import type { JsonRecord } from "../../../shared/types.ts";

export type ProtectedPaymentTerms = {
    sellerIdentity: string;
    amountTotal: number;
    sellerTransferAmount: number;
    currency: string;
    clientReferenceId: string;
    financialTermsHash: string;
    financialRevision: number;
    dualApprovalThresholdAmount: number;
    description: string | null;
};

export type ExpectedProtectedPaymentTerms = {
    buyerUserId: string;
    sellerUserId: string;
    sellerStripeAccountId: string;
    amountTotal: number;
    sellerTransferAmount: number;
    currency: string;
    financialTermsHash: string;
    financialRevision: number;
    dualApprovalThresholdAmount: number;
};

export function protectedPaymentTermsFromBody(body: JsonRecord): ProtectedPaymentTerms {
    assertAllowedKeys(body, [
        "sellerUserId",
        "amountTotal",
        "sellerTransferAmount",
        "currency",
        "clientReferenceId",
        "financialTermsHash",
        "financialRevision",
        "dualApprovalThresholdAmount",
        "description",
    ]);
    const sellerIdentity = requiredString(body, "sellerUserId", 200);
    const amountTotal = requiredInteger(body, "amountTotal");
    const sellerTransferAmount = requiredInteger(body, "sellerTransferAmount");
    const currency = optionalCurrency(body, "currency") ?? defaultCurrency();
    const clientReferenceId = requiredString(body, "clientReferenceId", 200);
    const financialTermsHash = requiredHash(body, "financialTermsHash");
    const financialRevision = optionalPositiveInteger(body, "financialRevision") ?? 1;
    const dualApprovalThresholdAmount = requiredInteger(body, "dualApprovalThresholdAmount");
    const description = optionalText(body, "description", 500);

    if (amountTotal <= 0) {
        throw new HttpError(400, "amountTotal must be positive");
    }
    if (sellerTransferAmount < 0 || sellerTransferAmount > amountTotal) {
        throw new HttpError(400, "sellerTransferAmount must be between zero and amountTotal");
    }
    if (currency !== "eur") {
        throw new HttpError(400, "protected C2C payments support EUR only");
    }
    if (dualApprovalThresholdAmount < 0) {
        throw new HttpError(400, "dualApprovalThresholdAmount must be non-negative");
    }

    return {
        sellerIdentity,
        amountTotal,
        sellerTransferAmount,
        currency,
        clientReferenceId,
        financialTermsHash,
        financialRevision,
        dualApprovalThresholdAmount,
        description,
    };
}

export function assertPaymentReplay(payment: ConnectPaymentRow, expected: ExpectedProtectedPaymentTerms): void {
    const matches =
        payment.buyer_cms_user_id === expected.buyerUserId &&
        payment.seller_cms_user_id === expected.sellerUserId &&
        payment.seller_stripe_account_id === expected.sellerStripeAccountId &&
        payment.amount_total === expected.amountTotal &&
        payment.seller_transfer_amount === expected.sellerTransferAmount &&
        payment.currency === expected.currency &&
        payment.financial_terms_hash === expected.financialTermsHash &&
        payment.financial_revision === expected.financialRevision &&
        payment.dual_approval_threshold_amount === expected.dualApprovalThresholdAmount;
    if (!matches) {
        throw new HttpError(409, "protected payment replay does not match immutable financial terms");
    }
}
