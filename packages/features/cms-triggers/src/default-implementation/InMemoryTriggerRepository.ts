import { DuplicateTriggerError } from "../core/errors";
import { matchesEndpointTriggerScope } from "../core/matchTrigger";
import {
    claimTrigger,
    initializeSchedule,
    isDue,
    nextRunAt,
    type ScheduledClaimOwner,
} from "../core/runtime/scheduled/state";
import type {
    ScheduledTriggerClaim,
    ScheduledTriggerClaimRequest,
    ScheduledTriggerCompletion,
} from "../interfaces/ScheduledTrigger";
import type { TriggerLastRun, TriggerRecord } from "../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../interfaces/TriggerRepository";

export class InMemoryTriggerRepository implements TriggerRepository {
    private readonly triggers = new Map<string, TriggerRecord>();
    private readonly claims = new Map<string, ScheduledClaimOwner>();

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        if (this.triggers.has(trigger.id)) {
            throw new DuplicateTriggerError(trigger.id);
        }
        const initialized = initializeSchedule(trigger);
        this.triggers.set(trigger.id, structuredClone(initialized));
        return structuredClone(initialized);
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        if (!this.triggers.has(trigger.id)) {
            return null;
        }
        const initialized = initializeSchedule(trigger);
        this.triggers.set(trigger.id, structuredClone(initialized));
        if (initialized.event.kind !== "schedule") {
            this.claims.delete(trigger.id);
        }
        return structuredClone(initialized);
    }

    async deleteTrigger(id: string): Promise<boolean> {
        this.claims.delete(id);
        return this.triggers.delete(id);
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        const found = this.triggers.get(id);
        return found ? structuredClone(found) : null;
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        return Array.from(this.triggers.values(), (trigger) => structuredClone(trigger));
    }

    async findEndpointTriggers(source: string, endpoint: string): Promise<TriggerRecord[]> {
        return Array.from(this.triggers.values())
            .filter((trigger) => matchesEndpointTriggerScope(trigger, source, endpoint))
            .map((trigger) => structuredClone(trigger));
    }

    async claimDueScheduledTriggers(request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim[]> {
        const due = Array.from(this.triggers.values())
            .filter((trigger) => isDue(trigger, request.now))
            .sort((left, right) =>
                (left.scheduleState?.nextRunAt ?? "").localeCompare(right.scheduleState?.nextRunAt ?? ""),
            )
            .slice(0, request.limit);
        return due.map((trigger) => this.claim(trigger, request));
    }

    async claimScheduledTriggerNow(
        id: string,
        request: ScheduledTriggerClaimRequest,
    ): Promise<ScheduledTriggerClaim | null> {
        const trigger = this.triggers.get(id);
        if (!trigger || !trigger.enabled || trigger.event.kind !== "schedule") {
            return null;
        }
        const running = trigger.scheduleState?.running;
        if (running && running.expiresAt > request.now) {
            return null;
        }
        return this.claim(trigger, request);
    }

    async completeScheduledTrigger(completion: ScheduledTriggerCompletion): Promise<TriggerRecord | null> {
        const trigger = this.triggers.get(completion.triggerId);
        const claim = this.claims.get(completion.triggerId);
        if (!trigger || trigger.event.kind !== "schedule" || !claim) {
            return null;
        }
        if (claim.token !== completion.token || claim.owner !== completion.owner) {
            return null;
        }
        const next: TriggerRecord = {
            ...trigger,
            lastRun: structuredClone(completion.lastRun),
            scheduleState: { nextRunAt: nextRunAt(trigger.event, completion.finishedAt) },
        };
        this.triggers.set(trigger.id, structuredClone(next));
        this.claims.delete(trigger.id);
        return structuredClone(next);
    }

    async setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        const found = this.triggers.get(id);
        if (!found) {
            return null;
        }
        const base = { ...found, enabled };
        const next =
            enabled && !found.enabled && found.event.kind === "schedule" && !found.scheduleState?.running
                ? initializeSchedule(withoutScheduleState(base))
                : initializeSchedule(base);
        this.triggers.set(id, structuredClone(next));
        return structuredClone(next);
    }

    private claim(trigger: TriggerRecord, request: ScheduledTriggerClaimRequest): ScheduledTriggerClaim {
        const claimed = claimTrigger(trigger, request);
        this.triggers.set(trigger.id, structuredClone(claimed.record));
        this.claims.set(trigger.id, claimed.owner);
        return structuredClone(claimed.claim);
    }

    async recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        const found = this.triggers.get(id);
        if (!found) {
            return null;
        }
        const next = { ...found, lastRun: structuredClone(lastRun) };
        this.triggers.set(id, structuredClone(next));
        return structuredClone(next);
    }
}

function withoutScheduleState(trigger: TriggerRecord): TriggerRecord {
    const { scheduleState: _scheduleState, ...rest } = trigger;
    return rest;
}
