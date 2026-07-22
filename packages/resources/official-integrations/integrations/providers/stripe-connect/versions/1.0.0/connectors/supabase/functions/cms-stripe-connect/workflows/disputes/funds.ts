import { retrieveStripeBalanceTransaction } from "../../provider/payments.ts";
import type { StripeDispute } from "../../provider/types.ts";
import { arrayAt, isRecord, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export type DisputeFundsTruth = { fundsWithdrawn: boolean; eventAt: string; eventId: string };

export async function disputeFundsTruth(
    provider: StripeDispute,
    eventId: string,
    eventType?: string,
    eventCreatedAt?: string | null,
): Promise<DisputeFundsTruth | null> {
    if (eventType === "charge.dispute.funds_withdrawn" || eventType === "charge.dispute.funds_reinstated") {
        const createdAt = eventCreatedAt ? Date.parse(eventCreatedAt) : Number.NaN;
        if (!Number.isFinite(createdAt)) {
            throw new Error("Stripe dispute funds event has no valid creation time");
        }
        return {
            fundsWithdrawn: eventType === "charge.dispute.funds_withdrawn",
            eventAt: new Date(createdAt).toISOString(),
            eventId,
        };
    }
    const transactions: JsonRecord[] = [];
    for (const entry of arrayAt(provider, "balance_transactions")) {
        if (isRecord(entry)) {
            transactions.push(entry);
            continue;
        }
        if (typeof entry === "string" && entry) {
            transactions.push(await retrieveStripeBalanceTransaction(entry));
        }
    }
    const ordered = transactions
        .filter(
            (transaction) =>
                Number.isSafeInteger(transaction.created) &&
                Number.isSafeInteger(transaction.amount) &&
                Number(transaction.amount) !== 0 &&
                stringAt(transaction, "id"),
        )
        .sort(
            (left, right) =>
                Number(right.created) - Number(left.created) ||
                stringAt(right, "id").localeCompare(stringAt(left, "id")),
        );
    const latest = ordered[0];
    if (!latest) {
        return null;
    }
    const latestCreated = Number(latest.created);
    const latestTransactions = ordered.filter((transaction) => Number(transaction.created) === latestCreated);
    const hasWithdrawal = latestTransactions.some((transaction) => Number(transaction.amount) < 0);
    const hasReinstatement = latestTransactions.some((transaction) => Number(transaction.amount) > 0);
    return {
        fundsWithdrawn: hasWithdrawal,
        eventAt: new Date(latestCreated * 1000).toISOString(),
        eventId:
            hasWithdrawal && hasReinstatement
                ? "balance-transaction:same-second-conflict"
                : `balance-transaction:${stringAt(latest, "id")}`,
    };
}
