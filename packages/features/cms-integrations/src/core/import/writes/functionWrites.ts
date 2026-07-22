import { DuplicateFunctionError, type CmsFunction, type FunctionRepository } from "@bernouy/cms-functions";
import { IntegrationRuntimeError } from "../../errors";
import type { IntegrationArtifactResult } from "../../../interfaces/IntegrationImport";

export type IntegrationFunctionWrite = {
    fn: CmsFunction;
    previous: CmsFunction | null;
};

export function writeFunctionsWithRollback(
    functionRepository: FunctionRepository,
    writes: IntegrationFunctionWrite[],
): Promise<IntegrationArtifactResult[]>;
export function writeFunctionsWithRollback<T>(
    functionRepository: FunctionRepository,
    writes: IntegrationFunctionWrite[],
    operation: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T>;
export async function writeFunctionsWithRollback<T>(
    functionRepository: FunctionRepository,
    writes: IntegrationFunctionWrite[],
    operation?: (artifacts: IntegrationArtifactResult[]) => Promise<T>,
): Promise<T> {
    const completed: IntegrationFunctionWrite[] = [];
    const artifacts: IntegrationArtifactResult[] = [];

    try {
        for (const write of writes) {
            if (write.previous) {
                const updated = await functionRepository.updateFunction(write.fn);
                if (!updated) {
                    throw new IntegrationRuntimeError(`function disappeared during import: ${write.fn.id}`, 409);
                }
                completed.push(write);
                artifacts.push({ type: "function", id: write.fn.id, action: "updated" });
            } else {
                await functionRepository.createFunction(write.fn);
                completed.push(write);
                artifacts.push({ type: "function", id: write.fn.id, action: "created" });
            }
        }
        return operation ? await operation(artifacts) : (artifacts as T);
    } catch (error) {
        await rollbackFunctions(functionRepository, completed);
        throw error;
    }
}

async function rollbackFunctions(
    functionRepository: FunctionRepository,
    completed: IntegrationFunctionWrite[],
): Promise<void> {
    for (const write of completed.reverse()) {
        try {
            if (write.previous) {
                await functionRepository.updateFunction(write.previous);
            } else {
                await functionRepository.deleteFunction(write.fn.id);
            }
        } catch {
            // Best-effort rollback: keep restoring remaining functions.
        }
    }
}

export { DuplicateFunctionError };
