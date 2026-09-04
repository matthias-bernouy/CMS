import { rest, restError } from "../../db/postgrest.ts";
import { upsertProviderException } from "../../db/repositories/events-exceptions.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { objectAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { EnforceSellerRecoveryPayoutHold } from "./seller-hold.ts";

type SellerRecoveryExposureDependencies = {
    enforceSellerRecoveryPayoutHold: EnforceSellerRecoveryPayoutHold;
};

export function createRecordSellerRecoveryExposure({
    enforceSellerRecoveryPayoutHold,
}: SellerRecoveryExposureDependencies) {
    return async function recordSellerRecoveryExposure(
        payment: ConnectPaymentRow,
        recoveryKey: string,
        exposureType: "chargeback" | "refund_recovery" | "reversal_failure",
        status: "at_risk" | "debt" | "recovered",
        amount: number,
        reason: string,
        details: JsonRecord,
        recoveredAmount?: number,
    ): Promise<void> {
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return;
        }
        const response = await rest("rpc/upsert_seller_recovery_exposure_and_refresh", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                p_seller_cms_user_id: payment.seller_cms_user_id,
                p_payment_id: payment.id,
                p_recovery_key: recoveryKey,
                p_exposure_type: exposureType,
                p_status: status,
                p_amount: amount,
                p_currency: payment.currency,
                p_reason: reason,
                p_details: details,
                p_recovered_amount: recoveredAmount,
            }),
        });
        if (!response.ok) {
            throw await restError(response);
        }
        const result = (await response.json()) as JsonRecord;
        const exposure = objectAt(result, "exposure");
        if (exposure.status === "debt") {
            await upsertProviderException(`seller-debt:${recoveryKey}`, {
                payment_id: payment.id,
                exception_type: "seller_recovery_debt",
                severity: "critical",
                message: reason,
                details: { recoveryKey, amount, sellerUserId: payment.seller_cms_user_id, ...details },
            });
        }
        // Provider payout controls are a second line of defence. Their outage must
        // never prevent the idempotent Transfer Reversal that can recover the funds.
        await enforceSellerRecoveryPayoutHold(payment.seller_cms_user_id).catch(() => null);
    };
}
