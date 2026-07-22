import { DuplicateFunctionError, type CmsFunction, validateFunction } from "@bernouy/cms-functions";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../../../interfaces/IntegrationImport";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../../errors";
import type { IntegrationFunctionWrite } from "../../../writes/functionWrites";

export async function buildFunctionWrites(
    deps: IntegrationImportDeps,
    functionArtifacts: CmsFunction[],
    options: IntegrationImportOptions,
): Promise<IntegrationFunctionWrite[]> {
    if (!functionArtifacts.length) {
        return [];
    }
    if (!deps.functions) {
        throw new IntegrationRuntimeError("function repository not configured");
    }

    const functionWrites: IntegrationFunctionWrite[] = [];
    const seen = new Set<string>();
    for (const fn of functionArtifacts) {
        if (seen.has(fn.id)) {
            throw new DuplicateFunctionError(fn.id);
        }
        seen.add(fn.id);

        const errors = await validateFunction(fn, { sources: deps.sources });
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await deps.functions.getFunction(fn.id);
        if (!options.force && previous) {
            throw new DuplicateFunctionError(fn.id);
        }
        functionWrites.push({ fn, previous });
    }
    return functionWrites;
}
