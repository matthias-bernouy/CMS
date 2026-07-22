import { listRows } from "../../db/postgrest.ts";
import {
    transferReversalSelect,
    type TransferRecoveryRow,
    type TransferReversalRow,
} from "../../db/records/transfers.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { publicReversal, publicTransferRecovery } from "./presentation.ts";

export async function loadPublicTransferRecovery(recovery: TransferRecoveryRow): Promise<JsonRecord> {
    const rows = await listRows<TransferReversalRow>(
        `transfer_reversals?recovery_id=eq.${recovery.id}` +
            `&select=${encodeURIComponent(transferReversalSelect)}&order=allocation_index.asc`,
    );
    return publicTransferRecovery(
        recovery,
        rows.map((row) => publicReversal(row as unknown as JsonRecord)),
    );
}
