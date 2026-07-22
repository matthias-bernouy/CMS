import { jsonResponse } from "../../../http";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleSellerExposureRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/upsert_seller_recovery_exposure_and_refresh" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const account = mock.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
        if (!account) {
            return jsonResponse({ message: "Stripe Connect account not found" }, 400);
        }
        let exposure = mock.tables.seller_recovery_exposures.find((row) => row.recovery_key === body.p_recovery_key);
        const previousStatus = String(exposure?.status ?? "");
        const requestedStatus = String(body.p_status);
        const status = ["recovered", "waived"].includes(previousStatus)
            ? previousStatus
            : previousStatus === "debt" && requestedStatus === "at_risk"
              ? "debt"
              : requestedStatus;
        const amount = Math.max(Number(exposure?.amount ?? 0), Number(body.p_amount));
        const values = {
            seller_cms_user_id: body.p_seller_cms_user_id,
            payment_id: body.p_payment_id,
            recovery_key: body.p_recovery_key,
            exposure_type:
                requestedStatus === "debt" ? body.p_exposure_type : (exposure?.exposure_type ?? body.p_exposure_type),
            status,
            amount,
            recovered_amount: ["recovered", "waived"].includes(status)
                ? amount
                : Math.min(
                      amount,
                      Math.max(Number(exposure?.recovered_amount ?? 0), Number(body.p_recovered_amount ?? 0)),
                  ),
            currency: body.p_currency,
            reason: body.p_reason,
            details: {
                ...((exposure?.details as JsonRecord | undefined) ?? {}),
                ...((body.p_details as JsonRecord | undefined) ?? {}),
            },
        };
        exposure = exposure ? mock.update(exposure, values) : mock.insertGeneric("seller_recovery_exposures", values);
        const active = mock.tables.seller_recovery_exposures.filter(
            (row) => row.seller_cms_user_id === body.p_seller_cms_user_id,
        );
        const debt = active
            .filter((row) => row.status === "debt")
            .reduce((sum, row) => sum + Number(row.amount) - Number(row.recovered_amount), 0);
        const atRisk = active
            .filter((row) => row.status === "at_risk")
            .reduce((sum, row) => sum + Number(row.amount) - Number(row.recovered_amount), 0);
        mock.update(account, {
            outstanding_debt_amount: debt,
            financial_exposure_amount: atRisk,
            risk_revision: Number(account.risk_revision ?? 0) + 1,
            risk_status: debt > 0 ? "blocked" : atRisk > 0 ? "restricted" : "standard",
            financial_hold_reason:
                debt > 0
                    ? "Seller recovery debt blocks payments and payouts"
                    : atRisk > 0
                      ? "Seller recovery exposure blocks payments and payouts"
                      : null,
            payout_blocked_at: debt > 0 || atRisk > 0 ? (account.payout_blocked_at ?? new Date().toISOString()) : null,
        });
        return jsonResponse({ account, exposure });
    }
    return null;
}
