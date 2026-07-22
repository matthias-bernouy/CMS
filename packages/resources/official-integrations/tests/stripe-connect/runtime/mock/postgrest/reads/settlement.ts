import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleSettlementReadRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (table === "rpc/read_settlement_release_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        await mock.waitForPostgrestRead("accounts");
        const seller = mock.tables.accounts.find((row) => row.cms_user_id === body.p_seller_cms_user_id);
        await mock.waitForPostgrestRead("transfers");
        const transfer = mock.tables.transfers.find(
            (row) => row.release_authorization_id === body.p_release_authorization_id,
        );
        await mock.waitForPostgrestRead("refunds");
        const sellerRecoveryAmount = mock.tables.refunds
            .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
            .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
        return jsonResponse([
            {
                seller_account: seller ? { ...seller } : null,
                existing_transfer: transfer ? { ...transfer } : null,
                seller_recovery_amount: sellerRecoveryAmount,
            },
        ]);
    }
    if (table === "rpc/read_settlement_release_ledger" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        await mock.waitForPostgrestRead("transfers");
        const transferredAmount = mock.tables.transfers
            .filter(
                (row) =>
                    same(row.payment_id, paymentId) &&
                    ["succeeded", "partially_reversed", "reversed"].includes(String(row.status)),
            )
            .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        await mock.waitForPostgrestRead("transfer_reversals");
        const reversedAmount = mock.tables.transfer_reversals
            .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
            .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
        await mock.waitForPostgrestRead("refunds");
        const sellerRecoveryAmount = mock.tables.refunds
            .filter((row) => same(row.payment_id, paymentId) && row.status === "succeeded")
            .reduce((sum, row) => sum + Number(row.seller_entitlement_reduction_amount ?? 0), 0);
        return jsonResponse([
            {
                transferred_amount: transferredAmount,
                reversed_amount: reversedAmount,
                seller_recovery_amount: sellerRecoveryAmount,
            },
        ]);
    }
    if (table === "rpc/read_payment_reconciliation_local_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const paymentId = Number(body.p_payment_id);
        const payment = mock.tables.payments.find((row) => same(row.id, paymentId));
        const refunds = mock.tables.refunds
            .filter((row) => same(row.payment_id, paymentId))
            .sort((left, right) => Number(left.id) - Number(right.id))
            .map((row) => ({ ...row }));
        return jsonResponse([
            {
                payment: payment ? { ...payment } : null,
                refunds,
            },
        ]);
    }
    if (table === "rpc/read_provider_transfer_reconciliation_context" && method === "POST") {
        const body = JSON.parse(await request.text()) as JsonRecord;
        const transfer = mock.tables.transfers.find((row) => row.stripe_transfer_id === body.p_stripe_transfer_id);
        const localReversedAmount = transfer
            ? mock.tables.transfer_reversals
                  .filter((row) => same(row.transfer_id, transfer.id) && row.status === "succeeded")
                  .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
            : 0;
        return jsonResponse([
            {
                transfer: transfer ? { ...transfer } : null,
                local_reversed_amount: localReversedAmount,
            },
        ]);
    }
    return null;
}
