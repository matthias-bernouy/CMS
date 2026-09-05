import { DuplicateSourceError, readPersistedSource, type Source, validateSource } from "@bernouy/cms-sources";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../../../interfaces/IntegrationImport";
import { IntegrationInputError } from "../../../../errors";
import type { IntegrationSourceWrite } from "../../../writes/sourceWrites";

export async function buildSourceWrites(
    deps: IntegrationImportDeps,
    sourceArtifacts: Source[],
    options: IntegrationImportOptions,
): Promise<IntegrationSourceWrite[]> {
    const sourceWrites: IntegrationSourceWrite[] = [];
    const seen = new Set<string>();
    for (const source of sourceArtifacts) {
        if (seen.has(source.urn)) {
            throw new DuplicateSourceError(source.urn);
        }
        seen.add(source.urn);

        const errors = validateSource(source, deps.sourceTargetValidation);
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await readPersistedSource(deps.sources, source.urn);
        if (!options.force && previous) {
            throw new DuplicateSourceError(source.urn);
        }
        sourceWrites.push({ source, previous });
    }
    return sourceWrites;
}
