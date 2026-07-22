import { filterValue, same } from "../../records";
import type { JsonRecord } from "../../types";
import { DashboardPersistence } from "./dashboard";

export class QueryPersistence extends DashboardPersistence {
    select(table: string, url: URL): JsonRecord[] {
        return this.selectRefs(table, url).map((row) => ({ ...row }));
    }

    selectRefs(table: string, url: URL): JsonRecord[] {
        let rows = this.tables[table]!;
        for (const [key, value] of url.searchParams.entries()) {
            const filter = filterValue(value);
            if (!filter) {
                continue;
            }
            if (["select", "order", "limit", "on_conflict"].includes(key)) {
                continue;
            }
            if (filter.operator === "not" && filter.value === "is.null") {
                rows = rows.filter((row) => row[key] !== null && row[key] !== undefined);
                continue;
            }
            if (filter.operator === "neq") {
                rows = rows.filter((row) => !same(row[key], filter.value));
                continue;
            }
            if (filter.operator === "in") {
                const values = filter.value.replace(/^\(|\)$/g, "").split(",");
                rows = rows.filter((row) => values.some((value) => same(row[key], value)));
                continue;
            }
            if (filter.operator !== "eq") {
                continue;
            }
            rows = rows.filter((row) => same(row[key], filter.value));
        }
        const or = url.searchParams.get("or");
        if (or) {
            if (or.includes("outstanding_debt_amount.gt.0") || or.includes("financial_exposure_amount.gt.0")) {
                rows = rows.filter(
                    (row) =>
                        Number(row.outstanding_debt_amount ?? 0) > 0 || Number(row.financial_exposure_amount ?? 0) > 0,
                );
            } else {
                const search = or.match(/ilike\.\*([^*]+)\*/)?.[1]?.toLowerCase() ?? "";
                const fields =
                    table === "accounts"
                        ? ["cms_user_id", "stripe_account_id"]
                        : [
                              "client_reference_id",
                              "buyer_cms_user_id",
                              "seller_cms_user_id",
                              "stripe_payment_intent_id",
                          ];
                rows = rows.filter((row) =>
                    fields.some((key) =>
                        String(row[key] ?? "")
                            .toLowerCase()
                            .includes(search),
                    ),
                );
            }
        }
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        return rows.slice(0, Number.isSafeInteger(limit) && limit >= 0 ? limit : rows.length);
    }

    claimCommerceProjectionOutbox(body: JsonRecord): JsonRecord[] {
        const limit = Number(body.p_limit ?? 50);
        return this.tables.commerce_projection_outbox
            .filter(
                (row) =>
                    (["pending", "retry"].includes(String(row.projection_status)) &&
                        (!row.next_attempt_at || Date.parse(String(row.next_attempt_at)) <= Date.now())) ||
                    (row.projection_status === "leased" &&
                        Date.parse(String(row.claimed_at ?? "")) <= Date.now() - 5 * 60_000),
            )
            .filter(
                (row) =>
                    !(
                        row.projection_kind === "refund" &&
                        row.recovery_key &&
                        this.tables.commerce_projection_outbox.some(
                            (predecessor) =>
                                predecessor.recovery_key === row.recovery_key &&
                                predecessor.projection_kind === "reversal" &&
                                Number(predecessor.causal_sequence) < Number(row.causal_sequence) &&
                                predecessor.projection_status !== "succeeded",
                        )
                    ),
            )
            .filter(
                (row) =>
                    !(
                        row.projection_kind === "refund" &&
                        this.tables.commerce_projection_outbox.some(
                            (predecessor) =>
                                same(predecessor.operation_id, row.operation_id) &&
                                predecessor.projection_kind === "refund" &&
                                Number(predecessor.causal_sequence) < Number(row.causal_sequence) &&
                                predecessor.projection_status !== "succeeded",
                        )
                    ),
            )
            .sort(
                (left, right) =>
                    String(left.created_at).localeCompare(String(right.created_at)) ||
                    Number(left.causal_sequence) - Number(right.causal_sequence) ||
                    Number(left.id) - Number(right.id),
            )
            .slice(0, limit)
            .map((row) =>
                this.update(row, {
                    projection_status: "leased",
                    claim_owner: body.p_owner,
                    claim_token: `claim-${row.id}-${Number(row.attempt_count ?? 0) + 1}`,
                    claimed_at: new Date().toISOString(),
                    attempt_count: Number(row.attempt_count ?? 0) + 1,
                    last_error: null,
                }),
            );
    }
}
