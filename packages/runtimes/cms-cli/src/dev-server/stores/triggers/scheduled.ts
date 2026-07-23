import {
    claimTrigger,
    isDue,
    nextRunAt,
    type ScheduledTriggerClaim,
    type ScheduledTriggerClaimRequest,
    type ScheduledTriggerCompletion,
    type TriggerRecord,
} from "@bernouy/cms-triggers";
import { publicTrigger, type StoredTrigger } from "./storage";

export function claimDueTriggers(
    triggers: StoredTrigger[],
    request: ScheduledTriggerClaimRequest,
): ScheduledTriggerClaim[] {
    return triggers
        .filter((trigger) => isDue(trigger, request.now))
        .sort((left, right) =>
            (left.scheduleState?.nextRunAt ?? "").localeCompare(right.scheduleState?.nextRunAt ?? ""),
        )
        .slice(0, request.limit)
        .map((trigger) => claimStored(trigger, request));
}

export function claimTriggerNow(
    triggers: StoredTrigger[],
    id: string,
    request: ScheduledTriggerClaimRequest,
): ScheduledTriggerClaim | null {
    const trigger = triggers.find((candidate) => candidate.id === id);
    if (!trigger || !trigger.enabled || trigger.event.kind !== "schedule") {
        return null;
    }
    if (trigger.scheduleState?.running && trigger.scheduleState.running.expiresAt > request.now) {
        return null;
    }
    return claimStored(trigger, request);
}

export function completeTrigger(
    triggers: StoredTrigger[],
    completion: ScheduledTriggerCompletion,
): TriggerRecord | null {
    const trigger = triggers.find((candidate) => candidate.id === completion.triggerId);
    if (
        !trigger ||
        trigger.event.kind !== "schedule" ||
        trigger._claimToken !== completion.token ||
        trigger._claimOwner !== completion.owner
    ) {
        return null;
    }
    trigger.lastRun = structuredClone(completion.lastRun);
    trigger.scheduleState = { nextRunAt: nextRunAt(trigger.event, completion.finishedAt) };
    delete trigger._claimToken;
    delete trigger._claimOwner;
    return publicTrigger(trigger);
}

function claimStored(trigger: StoredTrigger, request: ScheduledTriggerClaimRequest): ScheduledTriggerClaim {
    const claimed = claimTrigger(publicTrigger(trigger), request);
    Object.assign(trigger, claimed.record, {
        _claimToken: claimed.owner.token,
        _claimOwner: claimed.owner.owner,
    });
    return claimed.claim;
}
