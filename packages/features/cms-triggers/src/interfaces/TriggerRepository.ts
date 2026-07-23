import type { TriggerLastRun, TriggerRecord } from "./TriggerDefinition";
import type {
    ScheduledTriggerClaim,
    ScheduledTriggerClaimRequest,
    ScheduledTriggerCompletion,
} from "./ScheduledTrigger";

export interface TriggerRepository {
    createTrigger(trigger: TriggerRecord): Promise<TriggerRecord>;
    updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null>;
    deleteTrigger(id: string): Promise<boolean>;
    getTrigger(id: string): Promise<TriggerRecord | null>;
    getAllTriggers(): Promise<TriggerRecord[]>;
    /** Enabled request and response triggers whose optional source and endpoint scopes match. */
    findEndpointTriggers?(source: string, endpoint: string): Promise<TriggerRecord[]>;
    claimDueScheduledTriggers(request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim[]>;
    claimScheduledTriggerNow(id: string, request: ScheduledTriggerClaimRequest): Promise<ScheduledTriggerClaim | null>;
    completeScheduledTrigger(completion: ScheduledTriggerCompletion): Promise<TriggerRecord | null>;
    setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null>;
    recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null>;
}
