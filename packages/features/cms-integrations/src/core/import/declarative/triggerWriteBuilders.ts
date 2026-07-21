import {
    DuplicateTriggerError,
    validateTrigger,
    type TriggerDefinition,
    type TriggerRecord,
} from "@bernouy/cms-triggers";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationTriggerWrite } from "../triggerWrites";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../interfaces/IntegrationImport";

export async function buildTriggerWrites(
    deps: IntegrationImportDeps,
    triggerArtifacts: TriggerDefinition[],
    options: IntegrationImportOptions,
): Promise<IntegrationTriggerWrite[]> {
    if (!triggerArtifacts.length) {
        return [];
    }
    if (!deps.triggers) {
        throw new IntegrationRuntimeError("trigger repository not configured");
    }

    const triggerWrites: IntegrationTriggerWrite[] = [];
    const seen = new Set<string>();
    for (const trigger of triggerArtifacts) {
        if (seen.has(trigger.id)) {
            throw new DuplicateTriggerError(trigger.id);
        }
        seen.add(trigger.id);

        const errors = validateTrigger(trigger);
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await deps.triggers.getTrigger(trigger.id);
        if (!options.force && previous) {
            throw new DuplicateTriggerError(trigger.id);
        }
        triggerWrites.push({ trigger: mergeTriggerArtifact(trigger, previous), previous });
    }
    return triggerWrites;
}

function mergeTriggerArtifact(trigger: TriggerDefinition, previous: TriggerRecord | null): TriggerRecord {
    return {
        ...trigger,
        enabled: previous?.enabled ?? true,
        ...(previous?.lastRun ? { lastRun: previous.lastRun } : {}),
    };
}
