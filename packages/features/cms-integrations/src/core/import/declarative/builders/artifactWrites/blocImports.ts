import type {
    IntegrationBlocArtifact,
    IntegrationBlocImportContext,
    IntegrationImportDeps,
    IntegrationImportOptions,
} from "../../../../../interfaces/IntegrationImport";
import { isNativeHtmlTag } from "@bernouy/cms-content";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../../errors";

export async function importBlocArtifacts(
    deps: IntegrationImportDeps,
    artifacts: IntegrationBlocArtifact[],
    options: IntegrationImportOptions,
    context: IntegrationBlocImportContext,
) {
    if (!artifacts.length) {
        return [];
    }
    if (!deps.blocs) {
        throw new IntegrationRuntimeError("bloc importer not configured");
    }

    const seen = new Set<string>();
    const results = [];
    for (const artifact of artifacts) {
        if (isNativeHtmlTag(artifact.tag)) {
            throw new IntegrationInputError(
                "artifacts",
                `native HTML tag "${artifact.tag}" is platform-owned and cannot reach an integration bloc importer`,
            );
        }
        if (seen.has(artifact.tag)) {
            throw new IntegrationInputError("artifacts", `duplicate bloc artifact "${artifact.tag}"`);
        }
        seen.add(artifact.tag);
        const result = await deps.blocs.importBloc(artifact, options, context);
        results.push({ type: "bloc" as const, id: result.id, action: result.action });
    }
    return results;
}
