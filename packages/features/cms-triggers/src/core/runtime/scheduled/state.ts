import type { ScheduledTriggerClaim, ScheduledTriggerClaimRequest } from "../../../interfaces/ScheduledTrigger";
import type { TriggerRecord, TriggerScheduleEvent } from "../../../interfaces/TriggerDefinition";

export type ScheduledClaimOwner = { token: string; owner: string };

export function initializeSchedule(trigger: TriggerRecord, now = new Date()): TriggerRecord {
    if (trigger.event.kind !== "schedule") {
        const { scheduleState: _scheduleState, ...endpointTrigger } = trigger;
        return endpointTrigger;
    }
    if (trigger.scheduleState) {
        return trigger;
    }
    return {
        ...trigger,
        scheduleState: {
            nextRunAt: new Date(now.getTime() + (trigger.event.initialDelayMs ?? 0)).toISOString(),
        },
    };
}

export function isDue(trigger: TriggerRecord, now: string): boolean {
    if (!trigger.enabled || trigger.event.kind !== "schedule" || !trigger.scheduleState) {
        return false;
    }
    const running = trigger.scheduleState.running;
    return trigger.scheduleState.nextRunAt <= now && (!running || running.expiresAt <= now);
}

export function claimTrigger(
    trigger: TriggerRecord,
    request: ScheduledTriggerClaimRequest,
): { record: TriggerRecord; claim: ScheduledTriggerClaim; owner: ScheduledClaimOwner } {
    const token = request.makeId();
    const running = trigger.scheduleState?.running;
    const runId = running?.runId ?? request.makeId();
    const scheduledAt = running?.scheduledAt ?? trigger.scheduleState?.nextRunAt ?? request.now;
    const expiresAt = new Date(new Date(request.now).getTime() + request.leaseMs).toISOString();
    const record: TriggerRecord = {
        ...trigger,
        scheduleState: {
            nextRunAt: trigger.scheduleState?.nextRunAt ?? request.now,
            running: { runId, scheduledAt, startedAt: request.now, expiresAt },
        },
    };
    const owner = { token, owner: request.owner };
    return {
        record,
        owner,
        claim: {
            trigger: record,
            token,
            owner: request.owner,
            runId,
            runKey: `scheduled-trigger:${trigger.id}:${runId}`,
            scheduledAt,
            startedAt: request.now,
        },
    };
}

export function nextRunAt(event: TriggerScheduleEvent, finishedAt: string): string {
    return new Date(new Date(finishedAt).getTime() + event.intervalMs).toISOString();
}
