import { jsonResponse, setRestResponder } from "../../../harness";

export const claimRow = {
    id: 7,
    public_id: "30000000-0000-4000-8000-000000000007",
    order_id: 42,
    buyer_cms_user_id: "buyer-17",
    seller_id: 4,
    reason: "not_as_described",
    status: "return_required",
    description: "The received item differs from the listing.",
    buyer_requested_amount: 10_000,
    resolution_outcome: "return_required",
    resolution_buyer_refund_amount: null,
    resolution_seller_transfer_amount: null,
    resolution_protection_fee_refund_amount: null,
    decision_reason: "Return the item before resolution.",
    seller_response_by_at: "2026-07-18T08:00:00.000Z",
    return_ship_by_at: "2026-07-25T08:00:00.000Z",
    return_delivery_status: "carrier_accepted",
    return_provider_reference: "return-42",
    return_carrier_accepted_at: "2026-07-20T08:00:00.000Z",
    return_recipient_handoff_at: null,
    resolved_at: null,
    resolved_by: null,
    version: 3,
    created_at: "2026-07-17T08:00:00.000Z",
    updated_at: "2026-07-20T08:00:00.000Z",
};

export const claimEvents = [
    {
        id: 71,
        claim_id: 7,
        event_type: "opened",
        actor_kind: "buyer",
        actor_id: "buyer-17",
        message: null,
        data: { internal_key: "kept_opaque" },
        created_at: "2026-07-17T08:00:00.000Z",
    },
    {
        id: 72,
        claim_id: 7,
        event_type: "return_required",
        actor_kind: "admin",
        actor_id: "admin-3",
        message: "Return authorized",
        data: { return_flow: true },
        created_at: "2026-07-18T08:00:00.000Z",
    },
];

export const claimEvidenceRows = [
    {
        id: 81,
        claim_id: 7,
        submitted_by_kind: "buyer",
        submitted_by: "buyer-17",
        storage_bucket: "commerce-claim-evidence",
        storage_path: "claims/private/buyer.pdf",
        mime_type: "application/pdf",
        file_size: 1_024,
        original_filename: "buyer-proof.pdf",
        sha256: "a".repeat(64),
        description: null,
        metadata: { upload_kind: "buyer" },
        created_at: "2026-07-17T09:00:00.000Z",
    },
    {
        id: 82,
        claim_id: 7,
        submitted_by_kind: "seller",
        submitted_by: "seller-4",
        storage_bucket: "commerce-claim-evidence",
        storage_path: "claims/private/seller.png",
        mime_type: "image/png",
        file_size: 2_048,
        original_filename: "seller-proof.png",
        sha256: "b".repeat(64),
        description: "Packing photograph",
        metadata: { upload_kind: "seller" },
        created_at: "2026-07-17T10:00:00.000Z",
    },
];

export const claimReturnEvents = [
    {
        id: 91,
        provider_event_id: "return:event:1",
        provider_reference: "return-42",
        normalized_status: "carrier_accepted",
        occurred_at: "2026-07-20T08:00:00.000Z",
        created_at: "2026-07-20T08:01:00.000Z",
    },
    {
        id: 92,
        provider_event_id: "return:event:2",
        provider_reference: "return-42",
        normalized_status: "in_transit",
        occurred_at: "2026-07-21T08:00:00.000Z",
        created_at: "2026-07-21T08:01:00.000Z",
    },
];

type Options = {
    claim?: Record<string, unknown> | null;
    events?: Array<Record<string, unknown>>;
    evidence?: Array<Record<string, unknown>>;
    returnEvents?: Array<Record<string, unknown>>;
};

export function useClaimDetailResponder(options: Options = {}): void {
    setRestResponder((request) => {
        const path = new URL(request.url).pathname;
        if (path.endsWith("/rest/v1/rpc/get_marketplace_claim_read_model")) {
            return jsonResponse(claimReadModelEnvelope(options));
        }
        const claim = options.claim === undefined ? claimRow : options.claim;
        const events = options.events ?? claimEvents;
        const evidence = options.evidence ?? claimEvidenceRows;
        const returnEvents = options.returnEvents ?? claimReturnEvents;
        if (path.endsWith("/rest/v1/marketplace_claims")) {
            return jsonResponse(claim ? [claim] : []);
        }
        if (path.endsWith("/rest/v1/marketplace_claim_events")) {
            return jsonResponse(events);
        }
        if (path.endsWith("/rest/v1/marketplace_claim_evidence")) {
            return jsonResponse(evidence);
        }
        if (path.endsWith("/rest/v1/marketplace_claim_return_events")) {
            return jsonResponse(returnEvents);
        }
        throw new Error(`unexpected claim detail request ${request.url}`);
    });
}

export function claimReadModelEnvelope(options: Options = {}): Record<string, unknown> {
    const claim = options.claim === undefined ? claimRow : options.claim;
    if (!claim) {
        return { state: "not_found" };
    }
    const events = options.events ?? claimEvents;
    const evidence = options.evidence ?? claimEvidenceRows;
    const returnEvents = options.returnEvents ?? claimReturnEvents;
    return {
        state: "ok",
        claim: { ...claim, future_private_claim_field: "must-not-leak" },
        events: events.map((event) => ({ ...event, future_private_event_field: true })),
        evidence: evidence.map((item) => ({
            ...publicEvidenceRow(item),
            submitted_by: item.submitted_by,
            storage_bucket: item.storage_bucket,
            storage_path: item.storage_path,
        })),
        return_events: returnEvents.map((event) => ({
            ...event,
            provider_evidence: { future_private_provider_field: true },
        })),
    };
}

export function publicEvidenceRow(value: Record<string, unknown>): Record<string, unknown> {
    return {
        id: value.id,
        claim_id: value.claim_id,
        submitted_by_kind: value.submitted_by_kind,
        mime_type: value.mime_type,
        file_size: value.file_size,
        original_filename: value.original_filename,
        sha256: value.sha256,
        description: value.description,
        metadata: value.metadata,
        created_at: value.created_at,
    };
}
