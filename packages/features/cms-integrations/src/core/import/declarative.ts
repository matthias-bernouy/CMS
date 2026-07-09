import { IntegrationInputError } from "../errors";
import type { TemplateContext } from "../templates";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationImportDeps,
    IntegrationImportOptions,
    IntegrationImportResult,
} from "../../interfaces/IntegrationImport";
import { executeDeclarativeIntegration } from "./declarative/execute";
import {
    declarativeSecretBindingNames as secretBindingNames,
    resolveSecretRefs,
} from "./declarative/secrets";

export async function importDeclarativeIntegration(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
): Promise<IntegrationImportResult> {
    const { result } = await executeDeclarativeIntegration(deps, definition, answers, options);
    return result.importResult;
}

export async function importDeclarativeIntegrationWithCommit<T>(
    deps: IntegrationImportDeps,
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
    options: IntegrationImportOptions,
    commit: (result: IntegrationImportResult) => Promise<T>,
): Promise<{ importResult: IntegrationImportResult; committed: T }> {
    const { result } = await executeDeclarativeIntegration(deps, definition, answers, options, commit);
    if (!("committed" in result)) throw new IntegrationInputError("commit", "missing commit result");
    return result;
}

export function resolveDeclarativeSecretRefs(
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
): Record<string, string> {
    return resolveSecretRefs(definition, answers);
}

export function declarativeSecretBindingNames(definition: IntegrationDefinition): string[] {
    return secretBindingNames(definition);
}
