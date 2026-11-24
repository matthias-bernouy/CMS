import { listEventDeliveries } from "./MongoDeliveries";
import type { EventsStore } from "cms-events/interfaces/store";
import type { EventSubscription } from "cms-events/interfaces/subscription";
import type { SubscriptionOwner } from "@bernouy/cms-gateway/events";
import { eventHash, pageSize, decodeCursor, encodeCursor } from "cms-events/core/identity";
import { EventsError } from "cms-events/core/errors";
import { MongoEventMembership } from "./MongoMembership";
type Stored = { _id: string; ownerKey: string; cancelled: boolean; record?: EventSubscription };
export class MongoEventsStore extends MongoEventMembership implements EventsStore {
    async deliveryStatuses(owner: SubscriptionOwner, cursor: string | undefined, limit: number, now: number) {
        this.key(owner, "scope");
        pageSize(limit);
        return listEventDeliveries(this.db, owner, cursor, limit, now);
    }
    private key(owner: SubscriptionOwner, id: string) {
        if (owner.siteId !== this.siteId) {
            throw new EventsError("FORBIDDEN");
        }
        return eventHash({ owner, id });
    }
    async init() {
        await this.initMembership();
        await this.initPublications();
        await this.db.collection("domain_event_outbox").createIndex({
            siteId: 1,
            "record.deliveries.subscription.owner.installationId": 1,
            "record.deliveries.subscription.owner.consumerContractId": 1,
            _id: 1,
        });
        await this.db
            .collection("event_definitions")
            .createIndex({ "owner.siteId": 1, "owner.installationId": 1, "owner.namespace": 1, _id: 1 });
        await this.db.collection("event_publications").createIndex({ siteId: 1, pending: 1, _id: 1 });
        await this.db.collection("event_subscriptions").createIndex({ ownerKey: 1, "record.deleted": 1, _id: 1 });
        await this.db.collection("event_subscriptions").createIndex({
            "record.owner.siteId": 1,
            "record.definitionId": 1,
            "record.filterKey": 1,
            "record.enabled": 1,
            "record.deleted": 1,
            _id: 1,
        });
        await this.db
            .collection("domain_event_outbox")
            .createIndex({ siteId: 1, "record.event.source.definitionId": 1, dueAt: 1 });
        await this.db.collection("event_publications").createIndex({ siteId: 1, definitionId: 1, pending: 1 });
        return this;
    }
    async createSubscription(record: EventSubscription) {
        const _id = this.key(record.owner, record.id);
        if (!(await this.mutateMembership(_id, "create", record))) {
            const existing = await this.subscription(record.owner, record.id);
            if (!existing) {
                throw new EventsError("SUBSCRIPTION_CONFLICT");
            }
            return existing;
        }
        return record;
    }
    async subscription(owner: SubscriptionOwner, id: string): Promise<EventSubscription | null> {
        await this.settleMembership();
        const row = await this.db
            .collection<Stored>("event_subscriptions")
            .findOne({ _id: this.key(owner, id), ownerKey: eventHash(owner) }, { maxTimeMS: 2000 });
        if (!row || row.cancelled) {
            return null;
        }
        if (row.cancelled !== false || !row.record) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        return row.record;
    }
    async subscriptions(owner: SubscriptionOwner, cursor: string | undefined, limit: number) {
        this.key(owner, "scope");
        await this.settleMembership();
        const scope = { database: this.db.databaseName, owner };
        const after = decodeCursor(scope, cursor);
        const rows = await this.db
            .collection<Stored>("event_subscriptions")
            .find(
                {
                    ownerKey: eventHash(owner),
                    cancelled: false,
                    "record.deleted": false,
                    ...(after ? { _id: { $gt: after } } : {}),
                },
                { maxTimeMS: 2000 },
            )
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        return {
            items: rows.slice(0, limit).map((row) => {
                if (!row.record) {
                    throw new EventsError("CORE_UNAVAILABLE");
                }
                return row.record;
            }),
            ...(rows.length > limit ? { nextCursor: encodeCursor(scope, rows[limit - 1]!._id) } : {}),
        };
    }
    async replaceSubscription(record: EventSubscription, revision: number) {
        return this.mutateMembership(this.key(record.owner, record.id), revision, record);
    }
    async cancelSubscription(owner: SubscriptionOwner, id: string) {
        await this.mutateMembership(this.key(owner, id), "cancel");
    }
    async matchingSubscriptions(
        definitionId: string,
        limit: number,
        routingKeys: readonly string[],
        snapshot: number,
        cursor?: string,
    ) {
        const scope = { siteId: this.siteId, definitionId, routingKeys, snapshot };
        const after = decodeCursor(scope, cursor);
        const rows = await this.db
            .collection<{ _id: string; memberKey: string; record: EventSubscription }>("event_subscription_history")
            .find(
                {
                    siteId: this.siteId,
                    "record.definitionId": definitionId,
                    "record.filterKey": { $in: [...routingKeys] },
                    "record.deleted": false,
                    "record.enabled": true,
                    generation: { $lte: snapshot },
                    until: { $gt: snapshot },
                    ...(after ? { memberKey: { $gt: after } } : {}),
                },
                { maxTimeMS: 2000 },
            )
            .sort({ memberKey: 1 })
            .limit(limit + 1)
            .toArray();
        return {
            items: rows.slice(0, limit).map(({ record }) => record),
            ...(rows.length > limit ? { nextCursor: encodeCursor(scope, rows[limit - 1]!.memberKey) } : {}),
        };
    }
}
