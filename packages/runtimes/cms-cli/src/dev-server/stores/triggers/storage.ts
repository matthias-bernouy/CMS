import type { TriggerRecord } from "@bernouy/cms-triggers";

export type StoredTrigger = TriggerRecord & {
    _claimToken?: string;
    _claimOwner?: string;
};

export function publicTrigger(trigger: StoredTrigger): TriggerRecord {
    const { _claimToken, _claimOwner, ...record } = trigger;
    return structuredClone(record);
}

export function storedTrigger(trigger: TriggerRecord, previous?: StoredTrigger): StoredTrigger {
    return {
        ...structuredClone(trigger),
        ...(previous?._claimToken && trigger.scheduleState?.running ? { _claimToken: previous._claimToken } : {}),
        ...(previous?._claimOwner && trigger.scheduleState?.running ? { _claimOwner: previous._claimOwner } : {}),
    };
}

export function isTrigger(value: unknown): value is StoredTrigger {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const trigger = value as Partial<StoredTrigger>;
    const targetValid = typeof trigger.function?.id === "string" || typeof trigger.task?.id === "string";
    const eventValid =
        trigger.event?.kind === "schedule" ||
        (trigger.event?.kind === "endpoint" && typeof trigger.event.phase === "string");
    return typeof trigger.id === "string" && typeof trigger.enabled === "boolean" && eventValid && targetValid;
}
