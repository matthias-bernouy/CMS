import type { JsonRecord } from "../../shared/types.ts";
import { insertRow, rest, restError, upsertRow } from "../postgrest.ts";
import { resolveProviderExceptionRow } from "../reconciliation.ts";

export async function insertPaymentEvent(
    paymentId: number,
    eventType: string,
    actorKind: string,
    actorId: string,
    data: JsonRecord,
): Promise<void> {
    await insertRow<JsonRecord>("payment_events", "id", {
        payment_id: paymentId,
        event_type: eventType,
        actor_kind: actorKind,
        actor_id: actorId,
        data,
    });
}

export async function insertStripeEventDurably(values: JsonRecord): Promise<boolean> {
    const response = await rest("stripe_events?on_conflict=stripe_account_id,event_id&select=id", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify(values),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as JsonRecord[];
    return rows.length > 0;
}

export async function upsertProviderException(deduplicationKey: string, values: JsonRecord): Promise<void> {
    await upsertRow<JsonRecord>("provider_exceptions", "deduplication_key", "*", {
        deduplication_key: deduplicationKey,
        ...values,
        resolved_at: null,
        resolved_by: null,
    });
}

export async function resolveProviderException(deduplicationKey: string): Promise<void> {
    await resolveProviderExceptionRow(deduplicationKey, new Date().toISOString());
}
