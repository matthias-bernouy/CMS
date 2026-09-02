import { jsonResponse } from "../../../http";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleSellerPayoutRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/claim_seller_payout_hold" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const account = mock.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
        if (!account) {
            if (body.p_require_connected_account === true) {
                return jsonResponse({ claimed: false, connectedAccountFound: false, account: null });
            }
            return jsonResponse({ message: "Stripe Connect account not found" }, 400);
        }
        if (body.p_require_connected_account === true && !account.stripe_account_id) {
            return jsonResponse({ claimed: false, connectedAccountFound: false, account: null });
        }
        const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
        const claimed = (body.p_require_risk === false || required > 0) && !account.payout_hold_claimed_by;
        if (claimed) {
            mock.update(account, {
                payout_hold_claimed_by: body.p_owner,
                payout_hold_claimed_at: new Date().toISOString(),
            });
        }
        return jsonResponse({ claimed, account });
    }
    if (table === "rpc/finalize_seller_payout_configuration" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const account = mock.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
        if (!account) {
            return jsonResponse({ message: "Stripe Connect account not found" }, 400);
        }
        if (account.payout_hold_claimed_by !== body.p_owner) {
            return jsonResponse({ accepted: false, superseded: true, account });
        }
        const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
        const superseded = Number(account.risk_revision) !== Number(body.p_expected_risk_revision) || required > 0;
        if (!superseded) {
            const clearsAmbiguousRecoveryHold =
                body.p_clear_ambiguous_recovery_hold === true &&
                account.risk_status === "manual_review" &&
                account.financial_hold_reason === "Seller recovery payout hold is not confirmed" &&
                required === 0;
            mock.update(account, {
                payout_schedule: body.p_interval,
                risk_status: clearsAmbiguousRecoveryHold ? "standard" : account.risk_status,
                financial_hold_reason: clearsAmbiguousRecoveryHold ? null : account.financial_hold_reason,
                payout_blocked_at: clearsAmbiguousRecoveryHold ? null : account.payout_blocked_at,
                last_provider_sync_at: new Date().toISOString(),
                payout_hold_claimed_by: null,
                payout_hold_claimed_at: null,
                manual_payout_hold_started_at: null,
                manual_payout_hold_alert_at: null,
                manual_payout_hold_deadline_at: null,
                manual_payout_hold_restore_settings: null,
            });
        }
        return jsonResponse({ accepted: true, superseded, account });
    }
    if (table === "rpc/cancel_seller_payout_configuration" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const account = mock.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
        if (!account) {
            return jsonResponse({ message: "Stripe Connect account not found" }, 400);
        }
        if (account.payout_hold_claimed_by !== body.p_owner) {
            return jsonResponse({ accepted: false, superseded: true, account });
        }
        const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
        const superseded = Number(account.risk_revision) !== Number(body.p_expected_risk_revision) || required > 0;
        mock.update(account, {
            payout_hold_claimed_by: superseded ? body.p_owner : null,
            payout_hold_claimed_at: superseded ? new Date().toISOString() : null,
        });
        return jsonResponse({ accepted: true, superseded, account });
    }
    if (table === "rpc/complete_seller_payout_hold" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const account = mock.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
        if (!account) {
            return jsonResponse({ message: "Stripe Connect account not found" }, 400);
        }
        if (account.payout_hold_claimed_by !== body.p_owner) {
            return jsonResponse({ accepted: false, needsReapply: false, account });
        }
        const required = Number(account.outstanding_debt_amount) + Number(account.financial_exposure_amount);
        const applied = Number(body.p_applied_minimum_amount);
        const needsReapply = body.p_succeeded === true && required > applied;
        const holdStartedAt = String(account.manual_payout_hold_started_at ?? new Date().toISOString());
        const holdStartedTime = Date.parse(holdStartedAt);
        mock.update(
            account,
            body.p_succeeded === true
                ? {
                      provider_hold_minimum_amount: Math.max(
                          Number(account.provider_hold_minimum_amount ?? 0),
                          applied,
                      ),
                      payout_schedule: "manual",
                      manual_payout_hold_started_at: holdStartedAt,
                      manual_payout_hold_alert_at:
                          account.manual_payout_hold_alert_at ??
                          new Date(holdStartedTime + 75 * 24 * 60 * 60 * 1000).toISOString(),
                      manual_payout_hold_deadline_at:
                          account.manual_payout_hold_deadline_at ??
                          new Date(holdStartedTime + 90 * 24 * 60 * 60 * 1000).toISOString(),
                      manual_payout_hold_restore_settings:
                          account.manual_payout_hold_restore_settings ?? body.p_restore_settings,
                      last_provider_sync_at: new Date().toISOString(),
                      payout_hold_claimed_by: needsReapply ? body.p_owner : null,
                      payout_hold_claimed_at: needsReapply ? new Date().toISOString() : null,
                  }
                : {
                      risk_status: "manual_review",
                      financial_hold_reason: "Seller recovery payout hold is not confirmed",
                      payout_blocked_at: account.payout_blocked_at ?? new Date().toISOString(),
                      payout_hold_claimed_by: null,
                      payout_hold_claimed_at: null,
                  },
        );
        return jsonResponse({ accepted: true, needsReapply, account });
    }
    return null;
}
