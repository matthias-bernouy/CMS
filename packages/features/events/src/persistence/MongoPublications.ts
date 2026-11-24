import type { Db } from "mongodb";
import { MongoEventPayloads } from "@bernouy/cms-gateway/events/mongo";
import type { EventPublication } from "cms-events/interfaces/store";
import { EventsError } from "cms-events/core/errors";
import { MongoEventDefinitions } from "./MongoDefinitions";
type Publication = EventPublication & { _id: string; payloadRequired: boolean; expiresAt: Date };
export class MongoEventPublications extends MongoEventDefinitions {
    private readonly payloads: MongoEventPayloads;
    constructor(db: Db, siteId: string) {
        super(db, siteId);
        this.payloads = new MongoEventPayloads(this.db, "event_publication_payloads");
    }
    async initPublications() {
        await this.payloads.init();
        await this.db.collection("event_publications").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    private async hydrate(row: Publication): Promise<EventPublication> {
        const { _id: _id, expiresAt: _expiry, payloadRequired, ...record } = row;
        const pending = record.fanout;
        if (!pending || !payloadRequired || pending.expiresAt <= Date.now()) {
            return record;
        }
        const payloadJson = await this.payloads.get(this.siteId, record.id);
        if (payloadJson === undefined && pending.expiresAt > Date.now()) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        const event = { ...pending.event, ...(payloadJson === undefined ? {} : { payloadJson }) };
        return {
            ...record,
            fanout: {
                ...pending,
                event,
                ...(pending.batch
                    ? {
                          batch: {
                              ...pending.batch,
                              record: pending.batch.record ? { ...pending.batch.record, event } : null,
                          },
                      }
                    : {}),
            },
        };
    }

    async putPublication(record: EventPublication) {
        if (record.siteId !== this.siteId) {
            throw new EventsError("FORBIDDEN");
        }
        const payloadJson = record.fanout?.event.payloadJson;
        if (payloadJson !== undefined) {
            await this.payloads.put(this.siteId, record.id, payloadJson, record.fanout!.expiresAt);
        }
        const { payloadJson: _payload, ...metadata } = record.fanout?.event ?? {};
        const batch = record.fanout?.batch;
        const clean = batch?.record ? { ...batch.record, event: metadata as typeof batch.record.event } : null;
        const stored = record.fanout
            ? {
                  ...record,
                  fanout: {
                      ...record.fanout,
                      event: metadata as typeof record.fanout.event,
                      ...(batch ? { batch: { ...batch, record: clean } } : {}),
                  },
              }
            : record;
        try {
            await this.db.collection<Publication>("event_publications").insertOne({
                _id: record.id,
                ...stored,
                payloadRequired: payloadJson !== undefined,
                expiresAt: new Date(record.receiptExpiresAt),
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.publication(record.id);
            if (!existing || existing.fingerprint !== record.fingerprint) {
                throw new EventsError("PUBLICATION_CONFLICT");
            }
            return existing;
        }
        return record;
    }
    async publication(id: string): Promise<EventPublication | null> {
        const row = await this.db
            .collection<Publication>("event_publications")
            .findOne({ _id: id, siteId: this.siteId }, { maxTimeMS: 2000 });
        if (!row) {
            return null;
        }
        if (typeof row.pending !== "boolean") {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        return this.hydrate(row);
    }
    async pendingPublications(limit: number) {
        const rows = await this.db
            .collection<Publication>("event_publications")
            .find({ siteId: this.siteId, pending: true }, { maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        return Promise.all(rows.map((row) => this.hydrate(row)));
    }
    async stagePublicationBatch(
        publication: EventPublication,
        batch: NonNullable<NonNullable<EventPublication["fanout"]>["batch"]>,
    ) {
        const clean = batch.record
            ? { ...batch.record, event: (({ payloadJson: _payload, ...metadata }) => metadata)(batch.record.event) }
            : null;
        const row = await this.db.collection<Publication>("event_publications").findOneAndUpdate(
            {
                _id: publication.id,
                siteId: this.siteId,
                fingerprint: publication.fingerprint,
                pending: true,
                "fanout.cursor": publication.fanout?.cursor ?? { $exists: false },
                "fanout.batch": { $exists: false },
            },
            { $set: { "fanout.batch": { ...batch, record: clean } } },
            { returnDocument: "after", maxTimeMS: 2000 },
        );
        const result = row ? await this.hydrate(row) : await this.publication(publication.id);
        if (!result) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        return result;
    }
    async advancePublication(id: string, fingerprint: string, previous: string | undefined, next: string | undefined) {
        const result = await this.db.collection<Publication>("event_publications").updateOne(
            {
                _id: id,
                siteId: this.siteId,
                fingerprint,
                pending: true,
                "fanout.cursor": previous ?? { $exists: false },
            },
            next
                ? { $set: { "fanout.cursor": next }, $unset: { "fanout.batch": "" } }
                : { $set: { pending: false, payloadRequired: false }, $unset: { fanout: "" } },
        );
        if (result.matchedCount === 1 && !next) {
            await this.payloads.remove(this.siteId, id);
        }
    }
}
