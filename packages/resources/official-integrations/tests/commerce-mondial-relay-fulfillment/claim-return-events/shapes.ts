import type { DataShape } from "@bernouy/cms-sources";

export const text = (nullable = false): DataShape => ({ type: "string", ...(nullable ? { nullable: true } : {}) });
export const number = (): DataShape => ({ type: "number" });
export const object = (properties: Record<string, DataShape>, required?: string[]): DataShape => ({
    type: "object",
    properties,
    ...(required ? { required } : {}),
});
export const array = (items: DataShape): DataShape => ({ type: "array", items });

export const eventShape = object({
    normalizedStatus: text(true),
    occurredAt: text(true),
    eventLabel: text(),
    eventDate: text(true),
    eventTime: text(true),
    location: text(true),
});

export const trackingShape = object(
    {
        expeditionNumber: text(),
        status: text(),
        latestEventLabel: text(),
        latestEventAt: text(),
        carrierAcceptedAt: text(true),
        recipientHandoffAt: text(true),
        events: array(eventShape),
    },
    ["expeditionNumber", "status", "events"],
);
