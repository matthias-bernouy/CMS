import type { EventSubscription } from "cms-events/interfaces/subscription";
import { eventHash } from "cms-events/core/identity";
import { EventsError } from "cms-events/core/errors";
import { MongoEventPublications } from "./MongoPublications";
type Member = { _id: string; ownerKey: string; generation: number; cancelled: boolean; record?: EventSubscription };
type History = {
    _id: string;
    siteId: string;
    memberKey: string;
    generation: number;
    until: number;
    record: EventSubscription;
};
type Change = { key: string; sequence: number; before: number | null; value: Member };
type Head = { _id: string; sequence: number; pending?: Change };
/** A recoverable single-document commit point orders membership changes without Mongo transactions. */
export class MongoEventMembership extends MongoEventPublications {
    async initMembership() {
        try {
            await this.db.collection<Head>("event_membership_heads").insertOne({ _id: this.siteId, sequence: 0 });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
        }
        await this.db.collection("event_subscription_history").createIndex({
            siteId: 1,
            "record.definitionId": 1,
            "record.filterKey": 1,
            memberKey: 1,
            generation: 1,
        });
        await this.settleMembership();
    }
    async subscriptionSnapshot() {
        const head = await this.db
            .collection<Head>("event_membership_heads")
            .findOne({ _id: this.siteId }, { maxTimeMS: 2000 });
        if (!head || !Number.isSafeInteger(head.sequence)) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        return head.sequence;
    }
    protected async settleMembership(): Promise<Head> {
        for (let attempt = 0; attempt < 64; attempt++) {
            const head = await this.db
                .collection<Head>("event_membership_heads")
                .findOne({ _id: this.siteId }, { maxTimeMS: 2000 });
            if (!head || !Number.isSafeInteger(head.sequence) || head.sequence < 0) {
                throw new EventsError("CORE_UNAVAILABLE");
            }
            if (!head.pending) {
                return head;
            }
            await this.finishMembership(head.pending);
        }
        throw new EventsError("CORE_UNAVAILABLE");
    }
    protected async mutateMembership(key: string, mode: "create" | "cancel" | number, record?: EventSubscription) {
        for (let attempt = 0; attempt < 64; attempt++) {
            const head = await this.settleMembership();
            const previous = await this.db
                .collection<Member>("event_subscriptions")
                .findOne({ _id: key }, { maxTimeMS: 2000 });
            if (
                previous &&
                (!Number.isSafeInteger(previous.generation) ||
                    previous.generation < 1 ||
                    typeof previous.cancelled !== "boolean")
            ) {
                throw new EventsError("CORE_UNAVAILABLE");
            }
            if (mode === "create" && previous) {
                return false;
            }
            if (typeof mode === "number" && (!previous || previous.cancelled || previous.record?.revision !== mode)) {
                return false;
            }
            const sequence = head.sequence + 1;
            if (!Number.isSafeInteger(sequence)) {
                throw new EventsError("CAPACITY_EXCEEDED");
            }
            const change: Change = {
                key,
                sequence,
                before: previous?.generation ?? null,
                value: {
                    _id: key,
                    generation: sequence,
                    ownerKey: record ? eventHash(record.owner) : (previous?.ownerKey ?? key),
                    cancelled: mode === "cancel",
                    ...(record ? { record } : {}),
                },
            };
            const reserved = await this.db
                .collection<Head>("event_membership_heads")
                .updateOne(
                    { _id: this.siteId, sequence: head.sequence, pending: { $exists: false } },
                    { $set: { pending: change } },
                );
            if (reserved.matchedCount !== 1) {
                continue;
            }
            await this.finishMembership(change);
            return true;
        }
        throw new EventsError("CORE_UNAVAILABLE");
    }
    private async finishMembership(change: Change) {
        const history = this.db.collection<History>("event_subscription_history");
        if (change.before !== null) {
            await history.updateOne(
                { _id: eventHash({ siteId: this.siteId, key: change.key, generation: change.before }) },
                { $min: { until: change.sequence } },
            );
        }
        if (change.value.record) {
            try {
                await history.insertOne({
                    _id: eventHash({ siteId: this.siteId, key: change.key, generation: change.sequence }),
                    siteId: this.siteId,
                    memberKey: change.key,
                    generation: change.sequence,
                    until: Number.MAX_SAFE_INTEGER,
                    record: change.value.record,
                });
            } catch (error) {
                if ((error as { code?: number }).code !== 11000) {
                    throw error;
                }
            }
        }
        // An old helper may finish after a newer commit; it must never overwrite that commit.
        try {
            await this.db
                .collection<Member>("event_subscriptions")
                .replaceOne({ _id: change.key, generation: { $lte: change.sequence } }, change.value, { upsert: true });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
        }
        await this.db
            .collection<Head>("event_membership_heads")
            .updateOne(
                { _id: this.siteId, "pending.sequence": change.sequence },
                { $set: { sequence: change.sequence }, $unset: { pending: "" } },
            );
    }
}
