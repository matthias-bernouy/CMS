import type { JsonRecord } from "../types.ts";

export function projectableEvent(event: JsonRecord): JsonRecord {
    const normalizedStatus = String(event.normalized_status ?? "");
    const occurredAt = String(event.occurred_at ?? "");
    return {
        eventId: event.id,
        claimToken: event.projection_claim_token,
        projectionAttempts: event.projection_attempts,
        orderPublicId: event.order_public_id,
        providerEventId: event.provider_event_key,
        normalizedStatus,
        occurredAt,
        providerReference: event.expedition_number,
        ...(normalizedStatus === "carrier_accepted" ? { carrierAcceptedAt: occurredAt } : {}),
        ...(normalizedStatus === "collected_by_recipient" ? { recipientHandoffAt: occurredAt } : {}),
    };
}

export function projectableClaimReturnEvent(event: JsonRecord, claimId: number): JsonRecord {
    const providerStatus = String(event.normalized_status ?? "");
    const normalizedStatus = providerStatus === "collected_by_recipient" ? "recipient_handoff" : providerStatus;
    return {
        eventId: event.id,
        claimToken: event.projection_claim_token,
        projectionAttempts: event.projection_attempts,
        claimId,
        externalOrderId: event.order_public_id,
        providerEventId: event.provider_event_key,
        normalizedStatus,
        occurredAt: event.occurred_at,
        providerReference: event.expedition_number,
        providerEvidence: { provider: "mondial-relay", providerStatus },
    };
}

export function claimIdFromExternalOrderId(value: unknown): number | null {
    const match = /^claim-return:([1-9][0-9]*)$/.exec(String(value ?? ""));
    if (!match) {
        return null;
    }
    const claimId = Number(match[1]);
    return Number.isSafeInteger(claimId) ? claimId : null;
}
