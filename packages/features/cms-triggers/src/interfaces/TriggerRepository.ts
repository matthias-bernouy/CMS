import type { TriggerLastRun, TriggerRecord } from "./TriggerDefinition";

export interface TriggerRepository {
    createTrigger(trigger: TriggerRecord): Promise<TriggerRecord>;
    updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null>;
    deleteTrigger(id: string): Promise<boolean>;
    getTrigger(id: string): Promise<TriggerRecord | null>;
    getAllTriggers(): Promise<TriggerRecord[]>;
    setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null>;
    recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null>;
}
