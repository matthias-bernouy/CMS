import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateTriggerError } from "../core/errors";
import { initializeSchedule } from "../core/runtime/scheduled/state";
import type {
    ScheduledTriggerClaim,
    ScheduledTriggerClaimRequest,
    ScheduledTriggerCompletion,
} from "../interfaces/ScheduledTrigger";
import type { TriggerLastRun, TriggerRecord } from "../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../interfaces/TriggerRepository";
import { fromDoc, toDoc, type TriggerDoc } from "./mongo/documents";
import { claimDue, claimNow, complete } from "./mongo/scheduled";

export type MongoTriggerRepositoryConfig = {
    collectionPrefix?: string;
};

const ENDPOINT_TRIGGER_INDEX = {
    "event.source": 1,
    "event.endpoint": 1,
    "event.phase": 1,
    enabled: 1,
} as const;

const SCHEDULED_TRIGGER_INDEX = {
    "event.kind": 1,
    enabled: 1,
    "scheduleState.nextRunAt": 1,
    "scheduleState.running.expiresAt": 1,
} as const;

export class MongoTriggerRepository implements TriggerRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoTriggerRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await Promise.all([
            this.triggers.createIndex(ENDPOINT_TRIGGER_INDEX),
            this.triggers.createIndex(SCHEDULED_TRIGGER_INDEX),
        ]);
    }

    private get triggers(): Collection<TriggerDoc> {
        return this.db.collection<TriggerDoc>(this.prefix + "triggers");
    }

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        const initialized = initializeSchedule(trigger);
        try {
            await this.triggers.insertOne(toDoc(initialized) as OptionalUnlessRequiredId<TriggerDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new DuplicateTriggerError(trigger.id);
            }
            throw error;
        }
        return structuredClone(initialized);
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        const previous = await this.triggers.findOne({ _id: trigger.id });
        if (!previous) {
            return null;
        }
        const initialized = initializeSchedule(trigger);
        const next = toDoc(initialized);
        if (previous._claimToken && previous._claimOwner && initialized.scheduleState?.running) {
            next._claimToken = previous._claimToken;
            next._claimOwner = previous._claimOwner;
        }
        const { _id, ...rest } = next;
        const doc = await this.triggers.findOneAndReplace({ _id }, rest, { returnDocument: "after" });
        return fromDoc(doc);
    }

    async deleteTrigger(id: string): Promise<boolean> {
        const result = await this.triggers.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        return fromDoc(await this.triggers.findOne({ _id: id }));
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        const docs = await this.triggers.find().toArray();
        return docs.map((doc) => fromDoc(doc)!);
    }

    async findEndpointTriggers(source: string, endpoint: string): Promise<TriggerRecord[]> {
        const docs = await this.triggers
            .find(
                {
                    enabled: true,
                    "event.kind": "endpoint",
                    "event.phase": { $in: ["request", "response"] },
                    $or: [
                        { "event.source": source, "event.endpoint": endpoint },
                        { "event.source": source, "event.endpoint": { $exists: false } },
                        { "event.source": { $exists: false }, "event.endpoint": endpoint },
                        { "event.source": { $exists: false }, "event.endpoint": { $exists: false } },
                    ],
                },
                { hint: ENDPOINT_TRIGGER_INDEX },
            )
            .toArray();
        return docs.map((doc) => fromDoc(doc)!);
    }

    async claimDueScheduledTriggers(request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim[]> {
        return claimDue(this.triggers, request);
    }

    async claimScheduledTriggerNow(
        id: string,
        request: ScheduledTriggerClaimRequest,
    ): Promise<ScheduledTriggerClaim | null> {
        return claimNow(this.triggers, id, request);
    }

    async completeScheduledTrigger(completion: ScheduledTriggerCompletion): Promise<TriggerRecord | null> {
        return complete(this.triggers, completion);
    }

    async setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        const current = await this.triggers.findOne({ _id: id });
        if (!current) {
            return null;
        }
        const record = fromDoc(current)!;
        const resetSchedule =
            enabled && !record.enabled && record.event.kind === "schedule" && !record.scheduleState?.running;
        const next = initializeSchedule(
            resetSchedule ? withoutScheduleState({ ...record, enabled }) : { ...record, enabled },
        );
        const replacement = toDoc(next);
        if (current._claimToken && current._claimOwner && next.scheduleState?.running) {
            replacement._claimToken = current._claimToken;
            replacement._claimOwner = current._claimOwner;
        }
        const { _id, ...rest } = replacement;
        return fromDoc(await this.triggers.findOneAndReplace({ _id }, rest, { returnDocument: "after" }));
    }

    async recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        return fromDoc(
            await this.triggers.findOneAndUpdate({ _id: id }, { $set: { lastRun } }, { returnDocument: "after" }),
        );
    }
}

function withoutScheduleState(trigger: TriggerRecord): TriggerRecord {
    const { scheduleState: _scheduleState, ...rest } = trigger;
    return rest;
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
