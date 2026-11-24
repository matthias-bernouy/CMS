import { DURABLE_EVENT_RECORD_LIMIT, eventFingerprint } from "@bernouy/cms-gateway/events";
import type { EventServices } from "cms-events/interfaces/services";
import type { EventPublication, DomainOutboxRecord } from "cms-events/interfaces/store";
import { eventHash } from "./identity";
import { EventsError } from "./errors";
export async function preparePublicationBatch(services: EventServices, publication: EventPublication) {
    const pending = publication.fanout;
    if (!pending) {
        throw new EventsError("CORE_UNAVAILABLE");
    }
    let limit = services.policy.maxFanout;
    while (true) {
        const page = await services.store.matchingSubscriptions(
            publication.definitionId,
            limit,
            pending.routingKeys,
            pending.snapshot,
            pending.cursor,
        );
        const parent = pending.event.causation ?? [];
        const deliveries = page.items
            .filter(
                (subscription) =>
                    subscription.definitionDigest === pending.event.source.digest &&
                    parent.length < 32 &&
                    !parent.includes(eventFingerprint({ owner: subscription.owner, id: subscription.id })),
            )
            .map((subscription) => ({
                id: eventHash({
                    eventId: publication.occurrenceId,
                    owner: subscription.owner,
                    subscriptionId: subscription.id,
                    revision: subscription.revision,
                }),
                subscription,
                state: "pending" as const,
                attempts: 0,
                dueAt: services.now(),
            }));
        const { payloadJson: _expired, ...metadata } = pending.event;
        const event = pending.expiresAt <= services.now() ? metadata : pending.event;
        const record: DomainOutboxRecord = {
            id: eventHash({ occurrenceId: publication.occurrenceId, cursor: pending.cursor ?? null }),
            siteId: publication.siteId,
            fingerprint: publication.fingerprint,
            event,
            deliveries,
            expiresAt: pending.expiresAt,
            receiptExpiresAt: publication.receiptExpiresAt,
        };
        if (Buffer.byteLength(JSON.stringify(record)) > DURABLE_EVENT_RECORD_LIMIT) {
            if (limit === 1) {
                throw new EventsError("CAPACITY_EXCEEDED");
            }
            limit = Math.max(1, Math.floor(limit / 2));
            continue;
        }
        return {
            record: deliveries.length ? record : null,
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        };
    }
}
/** Each invocation hands off at most one immutable page of the accepted membership snapshot. */
export async function handoffEventPublication(services: EventServices, publication: EventPublication) {
    if (!publication.pending) {
        return;
    }
    if (!publication.fanout) {
        throw new EventsError("CORE_UNAVAILABLE");
    }
    if (!publication.fanout.batch) {
        publication = await services.store.stagePublicationBatch(
            publication,
            await preparePublicationBatch(services, publication),
        );
    }
    if (!publication.pending) {
        return;
    }
    const pending = publication.fanout;
    if (!pending?.batch) {
        throw new EventsError("CORE_UNAVAILABLE");
    }
    if (pending.batch.record) {
        await services.outbox.publish(pending.batch.record);
    }
    await services.store.advancePublication(
        publication.id,
        publication.fingerprint,
        pending.cursor,
        pending.batch.nextCursor,
    );
}
