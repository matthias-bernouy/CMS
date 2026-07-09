import { DuplicateTriggerError } from "../core/errors";
import type { TriggerLastRun, TriggerRecord } from "../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../interfaces/TriggerRepository";

export class InMemoryTriggerRepository implements TriggerRepository {
    private readonly triggers = new Map<string, TriggerRecord>();

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        if (this.triggers.has(trigger.id)) throw new DuplicateTriggerError(trigger.id);
        this.triggers.set(trigger.id, structuredClone(trigger));
        return structuredClone(trigger);
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        if (!this.triggers.has(trigger.id)) return null;
        this.triggers.set(trigger.id, structuredClone(trigger));
        return structuredClone(trigger);
    }

    async deleteTrigger(id: string): Promise<boolean> {
        return this.triggers.delete(id);
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        const found = this.triggers.get(id);
        return found ? structuredClone(found) : null;
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        return Array.from(this.triggers.values(), trigger => structuredClone(trigger));
    }

    async setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        const found = this.triggers.get(id);
        if (!found) return null;
        const next = { ...found, enabled };
        this.triggers.set(id, structuredClone(next));
        return structuredClone(next);
    }

    async recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        const found = this.triggers.get(id);
        if (!found) return null;
        const next = { ...found, lastRun: structuredClone(lastRun) };
        this.triggers.set(id, structuredClone(next));
        return structuredClone(next);
    }
}
