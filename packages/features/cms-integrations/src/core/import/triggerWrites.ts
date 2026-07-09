import { DuplicateTriggerError, type TriggerRecord, type TriggerRepository } from "@bernouy/cms-triggers";
import { IntegrationRuntimeError } from "../errors";
import type { IntegrationArtifactResult } from "../../interfaces/IntegrationImport";

export type IntegrationTriggerWrite = {
    trigger: TriggerRecord;
    previous: TriggerRecord | null;
};

export function writeTriggersWithRollback(
    triggerRepository: TriggerRepository,
    writes: IntegrationTriggerWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeTriggersWithRollback<T>(
    triggerRepository: TriggerRepository,
    writes: IntegrationTriggerWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeTriggersWithRollback<T>(
    triggerRepository: TriggerRepository,
    writes: IntegrationTriggerWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationTriggerWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            if (write.previous) {
                const updated = await triggerRepository.updateTrigger(write.trigger);
                if (!updated) throw new IntegrationRuntimeError(`trigger disappeared during import: ${write.trigger.id}`, 409);
                completed.push(write);
                artifacts.push({ type: "trigger", id: write.trigger.id, action: "updated" });
            } else {
                await triggerRepository.createTrigger(write.trigger);
                completed.push(write);
                artifacts.push({ type: "trigger", id: write.trigger.id, action: "created" });
            }
        }
        return operation ? await operation(artifacts) : artifacts as T;
    } catch (error) {
        await rollbackTriggers(triggerRepository, completed);
        throw error;
    }
}

async function rollbackTriggers(
    triggerRepository: TriggerRepository,
    completed: IntegrationTriggerWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) await triggerRepository.updateTrigger(write.previous);
            else await triggerRepository.deleteTrigger(write.trigger.id);
        } catch {
            // Best-effort rollback: keep restoring remaining triggers.
        }
    }
}

export { DuplicateTriggerError };
