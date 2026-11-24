import type { EventInitiator } from "@bernouy/cms-gateway/events";
import type { Db } from "mongodb";
import { eventFingerprint } from "@bernouy/cms-gateway/events";
import { EventsError } from "@bernouy/cms-events";
/** One bounded owner-scoped metadata projection; never load the business payload. */
export async function originParent(db: Db, siteId: string, installationId: string, deliveryId: string) {
    const match = { id: deliveryId, "subscription.owner.installationId": installationId };
    const row = await db.collection("domain_event_outbox").findOne(
        { siteId, "record.deliveries": { $elemMatch: match } },
        {
            projection: {
                "record.event.causation": 1,
                "record.event.initiator": 1,
                "record.deliveries": { $elemMatch: match },
            },
            maxTimeMS: 2000,
        },
    );
    const delivery = row?.record.deliveries.find((entry: { id: string }) => entry.id === deliveryId);
    if (!delivery || delivery.subscription.owner.installationId !== installationId) {
        throw new EventsError("FORBIDDEN");
    }
    const prior: string[] = row!.record.event.causation ?? [];
    if (prior.length >= 32) {
        throw new EventsError("INVALID_INPUT");
    }
    return {
        causation: [...prior, eventFingerprint({ owner: delivery.subscription.owner, id: delivery.subscription.id })],
        initiator: row!.record.event.initiator as EventInitiator | undefined,
    };
}
