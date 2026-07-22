import { readFinancialOperationDashboardPage } from "../../db/dashboard-reads.ts";
import type { FinancialOperationRow } from "../../db/records/operations.ts";
import { publicFinancialOperation } from "../../domain/admin/financial-operation.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { json } from "../../http/responses.ts";

export async function listFinancialOperations(request: Request): Promise<Response> {
    const actor = requireDashboardAdmin(request);
    const rows = await readFinancialOperationDashboardPage(request, actor);
    const operations = rows.map((row) =>
        publicFinancialOperation(
            row.operation as unknown as FinancialOperationRow,
            row.client_reference_id === null
                ? null
                : {
                      client_reference_id: row.client_reference_id,
                      currency: row.payment_currency ?? "",
                  },
        ),
    );
    return json({ operations, total: operations.length });
}
