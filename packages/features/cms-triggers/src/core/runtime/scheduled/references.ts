import { resolveFunctionValue, valueAt } from "@bernouy/cms-functions";
import type { ScheduledTriggerClaim } from "../../../interfaces/ScheduledTrigger";
import type { TriggerValue } from "../../../interfaces/TriggerDefinition";

type ScheduleVars = {
    trigger: { id: string };
    schedule: {
        runId: string;
        runKey: string;
        scheduledAt: string;
    };
};

export function resolveScheduledValue(value: TriggerValue | undefined, claim: ScheduledTriggerClaim): unknown {
    const vars: ScheduleVars = {
        trigger: { id: claim.trigger.id },
        schedule: {
            runId: claim.runId,
            runKey: claim.runKey,
            scheduledAt: claim.scheduledAt,
        },
    };
    return resolveFunctionValue(value, vars, resolveScheduleReference);
}

function resolveScheduleReference(ref: string, vars: ScheduleVars): unknown {
    if (ref === "$trigger.id") {
        return vars.trigger.id;
    }
    if (ref.startsWith("$schedule.")) {
        return valueAt(vars.schedule, ref.slice("$schedule.".length));
    }
    return undefined;
}
