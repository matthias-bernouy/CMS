import { jsonResponse } from "../../../http";
import { same } from "../../../records";
import type { JsonRecord } from "../../../types";
import type { StripeConnectMock } from "../../stripe-connect";

export async function handleTableRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
    table: string,
): Promise<Response | null> {
    if (!mock.tables[table]) {
        throw new Error(`unexpected table: ${table}`);
    }
    if (method === "GET") {
        await mock.waitForPostgrestRead(table);
        if (table === "accounts" && mock.omitNextAccountRead) {
            mock.omitNextAccountRead = false;
            return jsonResponse([]);
        }
        if (table === "payments" && mock.omitNextPaymentReadResult) {
            mock.omitNextPaymentReadResult = false;
            return jsonResponse([]);
        }
        if (table === "refunds" && url.searchParams.has("id") && mock.nextRefundReloadPause) {
            const pause = mock.nextRefundReloadPause;
            mock.nextRefundReloadPause = null;
            pause.entered();
            await pause.wait;
        }
        return jsonResponse(mock.select(table, url));
    }
    if (method === "POST") {
        const row = JSON.parse(await request.text()) as JsonRecord;
        let inserted: JsonRecord;
        if (table === "accounts") {
            inserted = mock.upsertAccount(row);
        } else if (table === "payments") {
            inserted = mock.insertPayment(row);
        } else {
            const conflict = url.searchParams.get("on_conflict");
            const conflictFields = conflict?.split(",") ?? [];
            const existing = conflictFields.length
                ? mock.tables[table].find((candidate) =>
                      conflictFields.every((field) => same(candidate[field], row[field])),
                  )
                : null;
            if (existing && request.headers.get("prefer")?.includes("ignore-duplicates")) {
                return jsonResponse([], 200);
            }
            inserted = existing ? mock.update(existing, row) : mock.insertGeneric(table, row);
        }
        return jsonResponse([inserted], 201);
    }
    if (method === "PATCH") {
        const patch = JSON.parse(await request.text()) as JsonRecord;
        if (table === "financial_operations" && patch.status === "failed" && mock.failFinancialOperationFailureUpdate) {
            mock.failFinancialOperationFailureUpdate = false;
            return jsonResponse({ message: "simulated financial operation failure update" }, 500);
        }
        const rows = mock.selectRefs(table, url).map((row) => mock.update(row, patch));
        if (table === "financial_operations") {
            for (const row of rows) {
                mock.enqueueCommerceProjection(row);
            }
        }
        return jsonResponse(rows);
    }
    throw new Error(`unexpected method: ${method} ${request.url}`);
    return null;
}
