import type {
    IntegrationBlocArtifact,
    IntegrationImportDeps,
    IntegrationImportOptions,
} from "../../../../../interfaces/IntegrationImport";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../../errors";

export async function importBlocArtifacts(
    deps: IntegrationImportDeps,
    artifacts: IntegrationBlocArtifact[],
    options: IntegrationImportOptions,
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
        if (seen.has(artifact.tag)) {
            throw new IntegrationInputError("artifacts", `duplicate bloc artifact "${artifact.tag}"`);
        }
        seen.add(artifact.tag);
        const result = await deps.blocs.importBloc(artifact, options);
        results.push({ type: "bloc" as const, id: result.id, action: result.action });
    }
    return results;
}
