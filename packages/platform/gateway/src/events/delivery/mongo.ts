import { MongoEventPayloads } from "./payloads";
import { DURABLE_EVENT_RECORD_LIMIT } from "./limits";
import type { Collection, Db } from "mongodb";
import type {
    DeliveryPayload,
    DeliverySubscription,
    DurableEventRecord,
    DurableEventStore,
    DurableDeliveryIntent,
} from "./interfaces";
type Stored<C extends DeliveryPayload, S extends DeliverySubscription> = {
    _id: string;
    siteId: string;
    dueAt: Date | null;
    expiresAt: Date;
    leaseUntil: Date;
    record: DurableEventRecord<C, S>;
    payloadRequired: boolean;
};
export class MongoEventOutbox<C extends DeliveryPayload, S extends DeliverySubscription>
    implements DurableEventStore<C, S>
{
    private readonly payloads: MongoEventPayloads;
    private readonly collection: Collection<Stored<C, S>>;
    constructor(
        db: Db,
        collectionName: string,
        private readonly key: (value: { siteId: string; id: string }) => string,
        private readonly clearPayload: (event: C) => C,
    ) {
        this.payloads = new MongoEventPayloads(db, `${collectionName}_payloads`);
        this.collection = db.collection(collectionName, {
            writeConcern: { w: "majority", j: true },
            readConcern: { level: "majority" },
        });
    }
    async init() {
        const store = this;
        await this.payloads.init();
        await store.collection.createIndex({ siteId: 1, dueAt: 1, leaseUntil: 1, _id: 1 });
        await store.collection.createIndex({ siteId: 1, "record.deliveries.id": 1 });
        await store.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await store.collection.createIndex(
            { siteId: 1, _id: 1 },
            { partialFilterExpression: { dueAt: { $type: "date" } } },
        );
        return store;
    }
    async publish(record: DurableEventRecord<C, S>) {
        if (Buffer.byteLength(JSON.stringify(record)) > DURABLE_EVENT_RECORD_LIMIT) {
            throw new TypeError("Event outbox record exceeds its byte bound");
        }
        const _id = this.key({ siteId: record.siteId, id: record.id });
        const previous = await this.collection.findOne({ _id, siteId: record.siteId }, { maxTimeMS: 2000 });
        if (previous) {
            if (previous.record.fingerprint !== record.fingerprint) {
                throw new TypeError("Conflicting durable event");
            }
            return;
        }
        const { payloadJson, ...metadata } = record.event;
        if (payloadJson !== undefined) {
            await this.payloads.put(record.siteId, record.id, payloadJson, record.expiresAt);
        }
        const stored = { ...record, event: metadata as C };
        try {
            await this.collection.insertOne({
                _id,
                siteId: record.siteId,
                record: stored,
                payloadRequired: payloadJson !== undefined,
                expiresAt: new Date(record.receiptExpiresAt ?? record.expiresAt),
                dueAt: dueAt(record),
                leaseUntil: new Date(0),
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.collection.findOne(
                { _id, siteId: record.siteId },
                { projection: { "record.fingerprint": 1 }, maxTimeMS: 2000 },
            );
            if (existing?.record.fingerprint !== record.fingerprint) {
                throw new TypeError("Conflicting event identity");
            }
        }
    }
    async claim(siteId: string, now: number, token: string, leaseUntil: number) {
        const row = await this.collection.findOneAndUpdate(
            { siteId, dueAt: { $ne: null, $lte: new Date(now) }, leaseUntil: { $lte: new Date(now) } },
            { $set: { leaseUntil: new Date(leaseUntil), "record.lease": { token, expiresAt: leaseUntil } } },
            { sort: { dueAt: 1, _id: 1 }, returnDocument: "after", maxTimeMS: 2000 },
        );
        if (!row) {
            return null;
        }
        const due = row.record.deliveries.find((intent) => intent.state === "pending" && intent.dueAt <= now);
        if (!due) {
            throw new TypeError("Claimed event has no due delivery");
        }
        const record = {
            ...row.record,
            deliveries: row.record.deliveries.map((intent) =>
                intent.id === due.id ? { ...intent, attempts: intent.attempts + 1 } : intent,
            ),
        };
        const reserved = await this.collection.updateOne(
            { _id: row._id, siteId, "record.lease.token": token, leaseUntil: { $gt: new Date(now) } },
            { $set: { "record.deliveries": record.deliveries } },
        );
        if (reserved.matchedCount !== 1) {
            return null;
        }
        const payloadJson =
            row.payloadRequired && record.expiresAt > now ? await this.payloads.get(siteId, record.id) : undefined;
        if (row.payloadRequired && payloadJson === undefined && record.expiresAt > now) {
            throw new TypeError("Durable event payload is unavailable");
        }
        return structuredClone({
            ...record,
            event: { ...record.event, ...(payloadJson === undefined ? {} : { payloadJson }) },
        });
    }
    async renew(siteId: string, id: string, token: string, now: number, leaseUntil: number) {
        const result = await this.collection.updateOne(
            {
                _id: this.key({ siteId, id }),
                siteId,
                "record.lease.token": token,
                leaseUntil: { $gt: new Date(now) },
            },
            { $set: { leaseUntil: new Date(leaseUntil), "record.lease.expiresAt": leaseUntil } },
        );
        return result.matchedCount === 1;
    }
    async finish(siteId: string, id: string, token: string, now: number, intent: DurableDeliveryIntent<S>) {
        const filter = {
            _id: this.key({ siteId, id }),
            siteId,
            "record.lease.token": token,
            leaseUntil: { $gt: new Date(now) },
        };
        const row = await this.collection.findOne(filter, { maxTimeMS: 2000 });
        if (!row) {
            return false;
        }
        const { lease: _lease, ...record } = row.record;
        const deliveries = record.deliveries.map((item) => (item.id === intent.id ? intent : item));
        const complete = deliveries.every((item) => item.state !== "pending");
        const next = { ...record, deliveries, event: complete ? this.clearPayload(record.event) : record.event };
        const result = await this.collection.replaceOne(filter, {
            siteId,
            record: next,
            expiresAt: new Date(next.receiptExpiresAt ?? next.expiresAt),
            payloadRequired: !complete && row.payloadRequired,
            dueAt: dueAt(next),
            leaseUntil: new Date(0),
        });
        if (result.matchedCount === 1 && complete) {
            await this.payloads.remove(siteId, id);
        }
        return result.matchedCount === 1;
    }
}
function dueAt<C extends DeliveryPayload, S extends DeliverySubscription>(
    record: DurableEventRecord<C, S>,
): Date | null {
    const times = record.deliveries.filter(({ state }) => state === "pending").map(({ dueAt }) => dueAt);
    return times.length ? new Date(Math.min(...times)) : null;
}
