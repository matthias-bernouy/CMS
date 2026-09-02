import { insertRow } from "../../db/postgrest.ts";
import { updateFinancialOperation } from "../../db/repositories/financial-operations.ts";
import { sellerPayoutHoldRpc } from "../../db/repositories/payout-controls.ts";
import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { publicSellerProviderRisk } from "../../domain/accounts/risk-presentation.ts";
import { json } from "../../http/responses.ts";
import { stripUndefined } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import type { SellerPayoutScheduleInput } from "./seller-schedule-input.ts";

export function payoutOperationRequest(input: SellerPayoutScheduleInput, account: ConnectAccountRow): JsonRecord {
    return stripUndefined({
        cmsUserId: input.userId,
        stripeAccountId: account.stripe_account_id,
        riskRevision: account.risk_revision,
        interval: input.interval,
        weeklyPayoutDays: input.weeklyPayoutDays.length ? input.weeklyPayoutDays : undefined,
        monthlyPayoutDays: input.monthlyPayoutDays.length ? input.monthlyPayoutDays : undefined,
        minimumBalanceEur: input.minimumBalanceEur ?? undefined,
        delayDaysOverride: input.delayDaysOverride ?? undefined,
        debitNegativeBalances: input.debitNegativeBalances ?? undefined,
        reason: input.reason ?? undefined,
    });
}

export async function succeedPayoutOperation(id: number, provider: JsonRecord): Promise<void> {
    await updateFinancialOperation(id, {
        status: "succeeded",
        response: provider,
        last_error: null,
        completed_at: new Date().toISOString(),
    });
}

export function sellerPayoutResponse(
    account: ConnectAccountRow,
    provider: JsonRecord,
    operationId: number,
    changeId: string,
): Response {
    return json({
        ...publicSellerProviderRisk(account, null, provider),
        providerOperationId: operationId,
        payoutScheduleChangeId: changeId,
    });
}

export async function completeAmbiguousPayout(
    userId: string,
    owner: string,
    account: ConnectAccountRow,
    operation: FinancialOperationRow | null,
    payoutScheduleChangeId: string,
    operationRequest: JsonRecord,
    message: string,
): Promise<void> {
    await sellerPayoutHoldRpc("complete_seller_payout_hold", {
        p_seller_cms_user_id: userId,
        p_owner: owner,
        p_expected_risk_revision: account.risk_revision,
        p_applied_minimum_amount: account.provider_hold_minimum_amount,
        p_succeeded: false,
        p_error: message,
    }).catch(() => null);
    await insertRow<JsonRecord>("provider_exceptions", "id", {
        operation_id: operation?.id ?? null,
        exception_type: "payout_schedule_update_ambiguous",
        severity: "critical",
        message,
        details: { userId, payoutScheduleChangeId, requested: operationRequest },
    }).catch(() => null);
}
