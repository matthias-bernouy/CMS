type ObjectValue = Record<string, unknown>;

const fulfillmentStatuses = new Set([
    "awaiting_shipment",
    "shipment_creating",
    "label_created",
    "seller_handoff_declared",
    "carrier_accepted",
    "in_transit",
    "arrived_at_pickup_point",
    "available_for_pickup",
    "collected_by_recipient",
    "incident",
    "lost",
    "pickup_expired",
    "returning_to_sender",
    "returned_to_sender",
    "cancelled",
    "manual_review",
]);

export function saleStatus(value: unknown, operation: ObjectValue | null): string {
    const order = String(value || "");
    if (["awaiting_quote", "awaiting_payment", "cancellation_pending", "cancelled", "expired"].includes(order)) {
        return order;
    }
    const settlement = String(operation?.settlementStatus || "");
    const claim = String(operation?.claimStatus || "");
    const payment = String(operation?.paymentStatus || "");
    if (["manual_review", "blocked"].includes(settlement)) {
        return "review_required";
    }
    if (claim && !["resolved_buyer", "resolved_seller", "resolved_split"].includes(claim)) {
        return "dispute_in_progress";
    }
    if (["refund_pending", "reversal_pending"].includes(settlement)) {
        return "refund_in_progress";
    }
    if (["refunded", "reversed"].includes(settlement)) {
        return "refunded";
    }
    if (order === "completed") {
        return order;
    }
    if (order !== "active") {
        return "review_required";
    }
    if (payment && payment !== "succeeded") {
        return "review_required";
    }
    const fulfillment = String(operation?.fulfillmentStatus || "");
    return fulfillmentStatuses.has(fulfillment) ? fulfillment : "active";
}
