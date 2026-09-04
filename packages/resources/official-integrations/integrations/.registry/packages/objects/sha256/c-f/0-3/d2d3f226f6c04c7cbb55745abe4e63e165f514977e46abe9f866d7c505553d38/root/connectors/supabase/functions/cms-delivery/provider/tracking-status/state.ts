export const normalizedStatuses = [
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
] as const;

export type NormalizedTrackingStatus = (typeof normalizedStatuses)[number];

const terminalStatuses = new Set<string>(["collected_by_recipient", "lost", "returned_to_sender", "cancelled"]);

const forwardRank: Record<string, number> = {
    creating: 0,
    created: 1,
    label_ready: 2,
    carrier_accepted: 3,
    in_transit: 4,
    arrived_at_pickup_point: 5,
    available_for_pickup: 6,
    collected_by_recipient: 7,
};

export function fallbackTrackingStatus(statusCode: string): string {
    if (statusCode === "80") {
        return "created";
    }
    if (statusCode === "81") {
        return "in_transit";
    }
    if (statusCode === "82") {
        return "arrived_at_pickup_point";
    }
    return "incident";
}

export function statusAfterObservation(current: string, observed: string): string {
    if (!observed || current === observed || terminalStatuses.has(current)) {
        return current;
    }
    if (observed === "returned_to_sender" || observed === "lost" || observed === "collected_by_recipient") {
        return observed;
    }
    if (current === "pickup_expired") {
        return observed === "returning_to_sender" ? observed : current;
    }
    if (current === "returning_to_sender") {
        return current;
    }
    if (observed === "returning_to_sender" || observed === "pickup_expired" || observed === "incident") {
        return observed;
    }
    if (current === "incident") {
        return observed;
    }
    const currentRank = forwardRank[current] ?? 0;
    const observedRank = forwardRank[observed] ?? 0;
    return observedRank >= currentRank ? observed : current;
}
