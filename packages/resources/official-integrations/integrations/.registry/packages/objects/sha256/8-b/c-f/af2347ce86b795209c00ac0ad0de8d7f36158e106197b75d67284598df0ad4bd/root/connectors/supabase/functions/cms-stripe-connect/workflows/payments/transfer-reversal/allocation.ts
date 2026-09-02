import { updateRow } from "../../../db/postgrest.ts";
import { updateFinancialOperation } from "../../../db/repositories/financial-operations.ts";
import { sumSucceededTransferReversalAmounts } from "../../../db/repositories/ledger.ts";
import type { ReservedTransferRecovery } from "../../../db/records/transfers.ts";
import {
    transferReversalSelect,
    transferSelect,
    type TransferReversalRow,
    type TransferRow,
} from "../../../db/records/transfers.ts";
import { publicReversal } from "../../../domain/transfers/presentation.ts";
import { HttpError } from "../../../http/errors.ts";
import {
    createStripeTransferReversal,
    listStripeTransferReversals,
    retrieveStripeTransferReversal,
} from "../../../provider/transfers.ts";
import { stableStripeIdempotencyKey } from "../../../shared/crypto.ts";
import { objectAt, recordArrayAt, stringAt } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";

type TransferReversalAllocation = ReservedTransferRecovery["allocations"][number];

export async function executeTransferReversalAllocation(allocation: TransferReversalAllocation): Promise<JsonRecord> {
    let { reversal, operation, transfer } = allocation;
    if (!transfer.stripe_transfer_id) {
        throw new HttpError(409, "allocated Transfer has no confirmed Stripe id");
    }
    if (reversal.status !== "succeeded" || !reversal.stripe_transfer_reversal_id) {
        const businessKey = operation.business_key;
        let stripeReversal: JsonRecord | null = null;
        if (operation.status === "succeeded" && operation.stripe_object_id) {
            stripeReversal = await retrieveStripeTransferReversal(
                transfer.stripe_transfer_id,
                operation.stripe_object_id,
            );
        } else if (operation.attempt_count > 0) {
            stripeReversal = await findStripeTransferReversal(
                transfer.stripe_transfer_id,
                businessKey,
                reversal.amount,
            );
            if (!stripeReversal && operation.status === "manual_review") {
                throw new HttpError(409, "Transfer Reversal outcome is unresolved and requires finance review");
            }
        }
        if (!stripeReversal) {
            operation =
                (await updateFinancialOperation(operation.id, {
                    status: "processing",
                    claimed_at: new Date().toISOString(),
                    attempt_count: operation.attempt_count + 1,
                })) ?? operation;
            reversal =
                (await updateRow<TransferReversalRow>(
                    "transfer_reversals",
                    reversal.id,
                    { status: "processing" },
                    transferReversalSelect,
                )) ?? reversal;
            stripeReversal = await createStripeTransferReversal(
                transfer.stripe_transfer_id,
                reversal.amount,
                businessKey,
                await stableStripeIdempotencyKey("transfer-reversal", businessKey),
            );
        }
        reversal =
            (await updateRow<TransferReversalRow>(
                "transfer_reversals",
                reversal.id,
                {
                    stripe_transfer_reversal_id: stripeReversal.id,
                    status: "succeeded",
                    provider_snapshot: stripeReversal,
                },
                transferReversalSelect,
            )) ?? reversal;
        await updateFinancialOperation(operation.id, {
            status: "succeeded",
            stripe_object_id: stripeReversal.id,
            response: stripeReversal,
            last_error: null,
            completed_at: new Date().toISOString(),
        });
        const reversedOnTransfer = await sumSucceededTransferReversalAmounts(transfer.id);
        transfer =
            (await updateRow<TransferRow>(
                "transfers",
                transfer.id,
                {
                    status: reversedOnTransfer >= transfer.amount ? "reversed" : "partially_reversed",
                },
                transferSelect,
            )) ?? transfer;
    }
    return publicReversal(reversal);
}

async function findStripeTransferReversal(
    transferId: string,
    operationKey: string,
    amount: number,
): Promise<JsonRecord | null> {
    const list = await listStripeTransferReversals(transferId);
    const matches = recordArrayAt(list, "data").filter(
        (reversal) =>
            Number(reversal.amount) === amount &&
            stringAt(objectAt(reversal, "metadata"), "operation_key") === operationKey,
    );
    if (matches.length > 1 || (matches.length === 0 && list.has_more === true)) {
        throw new HttpError(409, "Stripe Transfer Reversal search is ambiguous");
    }
    return matches[0] ?? null;
}
