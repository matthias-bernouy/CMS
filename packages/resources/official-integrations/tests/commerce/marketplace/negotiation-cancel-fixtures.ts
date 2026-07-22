export const canceledProposalRow = {
    id: 44,
    public_id: "proposal_44",
    commerce_offer_id: 42,
    commerce_offer_slug: "racket-pro",
    commerce_offer_title: "Racket Pro",
    seller_cms_user_id: "seller-user",
    seller_display_name: "Marketplace seller",
    buyer_cms_user_id: "buyer-user",
    reference_amount: 10_000,
    minimum_amount: 8_000,
    maximum_amount: 12_000,
    proposed_amount: 9_500,
    currency: "eur",
    buyer_message: null,
    decision_message: "Duplicate listing",
    status: "canceled",
    version: 4,
    expires_at: "2026-07-25T12:00:00Z",
    accepted_at: null,
    rejected_at: null,
    withdrawn_at: null,
    created_at: "2026-07-20T12:00:00Z",
    updated_at: "2026-07-22T12:00:00Z",
};

export const cancellationEventRow = {
    id: 90,
    event_type: "canceled",
    actor_kind: "admin",
    actor_id: "operator-9",
    previous_status: "pending",
    next_status: "canceled",
    data: { reason: "Duplicate listing" },
    created_at: "2026-07-22T12:00:00Z",
};

export const proposalProjection = {
    id: 44,
    publicId: "proposal_44",
    offerId: 42,
    offerSlug: "racket-pro",
    offerTitle: "Racket Pro",
    sellerUserId: "seller-user",
    sellerDisplayName: "Marketplace seller",
    buyerUserId: "buyer-user",
    viewerRole: "admin",
    referenceAmount: 10_000,
    minimumAmount: 8_000,
    maximumAmount: 12_000,
    proposedAmount: 9_500,
    currency: "eur",
    buyerMessage: null,
    decisionMessage: "Duplicate listing",
    status: "canceled",
    version: 4,
    expiresAt: "2026-07-25T12:00:00Z",
    acceptedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    createdAt: "2026-07-20T12:00:00Z",
    updatedAt: "2026-07-22T12:00:00Z",
};

export const eventProjection = {
    id: 90,
    eventType: "canceled",
    actorKind: "admin",
    actorId: "operator-9",
    previousStatus: "pending",
    nextStatus: "canceled",
    data: { reason: "Duplicate listing" },
    createdAt: "2026-07-22T12:00:00Z",
};

export const consumedFields = [
    "id",
    "offerTitle",
    "status",
    "version",
    "referenceAmount",
    "minimumAmount",
    "maximumAmount",
    "proposedAmount",
    "currency",
    "buyerMessage",
    "decisionMessage",
    "sellerDisplayName",
    "sellerUserId",
    "buyerUserId",
    "expiresAt",
] as const;

export const consumedProjection = pick(proposalProjection, consumedFields);

export function pick<T extends Record<string, unknown>, K extends readonly (keyof T)[]>(value: T, keys: K) {
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
