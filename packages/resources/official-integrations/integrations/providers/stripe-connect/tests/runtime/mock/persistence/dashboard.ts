import type { DashboardTable } from "../../../integration-contracts/dashboard/dashboard-contract-harness";
import { financialTermsHash } from "../../constants";
import { same } from "../../records";
import type { JsonRecord } from "../../types";
import { AccountFixtures } from "../fixtures/accounts";

export class DashboardPersistence extends AccountFixtures {
    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map((row) => ({ ...row }));
    }

    seedDashboardPayment(clientReferenceId: string, patch: JsonRecord = {}): number {
        const payment = this.insertPayment({
            client_reference_id: clientReferenceId,
            financial_terms_hash: financialTermsHash,
            financial_revision: 1,
            dual_approval_threshold_amount: 1000,
            buyer_cms_user_id: `buyer-${clientReferenceId}`,
            seller_cms_user_id: `seller-${clientReferenceId}`,
            seller_stripe_account_id: `acct_${clientReferenceId}`,
            stripe_payment_intent_id: `pi_${clientReferenceId}`,
            transfer_group: `group_${clientReferenceId}`,
            currency: "eur",
            amount_total: 1200,
            seller_transfer_amount: 1080,
            platform_retained_amount: 120,
            payment_status: "succeeded",
            settlement_status: "held",
            description: null,
            ...patch,
        });
        return Number(payment.id);
    }

    seedDashboardRow(table: DashboardTable, row: JsonRecord): JsonRecord {
        return this.insertGeneric(table, row);
    }

    patchDashboardRow(table: DashboardTable, id: number, patch: JsonRecord): void {
        const row = this.tables[table]?.find((candidate) => same(candidate.id, id));
        if (!row) {
            throw new Error(`unknown ${table} dashboard row ${id}`);
        }
        this.update(row, patch);
    }

    clearPostgrestRequests(): void {
        this.postgrestRequests.length = 0;
    }

    clearStripeRequests(): void {
        this.stripeRequests.length = 0;
    }

    clearExternalRequestOrder(): void {
        this.externalRequestOrder.length = 0;
    }

    failNextAccountReloadAfterTermsAcceptance(): void {
        this.failAccountReloadAfterTermsAcceptance = true;
    }

    dashboardPage(table: DashboardTable, body: JsonRecord, searchFields: string[], idField?: string): JsonRecord[] {
        let rows = this.tables[table]!;
        if (idField && typeof body.p_dispute_id === "string") {
            rows = rows.filter((row) => same(row[idField], body.p_dispute_id));
        } else {
            if (typeof body.p_status === "string") {
                rows = rows.filter((row) => row.status === body.p_status);
            }
            if (typeof body.p_search === "string") {
                const pattern = new RegExp(
                    body.p_search
                        .split("*")
                        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                        .join(".*"),
                    "i",
                );
                rows = rows.filter((row) => searchFields.some((field) => pattern.test(String(row[field] ?? ""))));
            }
        }
        const limit = Number(body.p_limit);
        return rows
            .slice(0, Number.isSafeInteger(limit) && limit >= 0 ? limit : rows.length)
            .map((row) => ({ ...row }));
    }

    requiredDashboardPayment(paymentId: unknown): JsonRecord {
        const payment = this.tables.payments.find((row) => same(row.id, paymentId));
        if (!payment) {
            throw new Error(`unknown dashboard payment ${String(paymentId)}`);
        }
        return payment;
    }
}
