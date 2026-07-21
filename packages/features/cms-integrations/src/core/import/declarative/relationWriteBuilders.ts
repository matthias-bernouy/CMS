import {
    DuplicateRelationError,
    validateRelationSources,
    type CmsRelation,
    type RelationEndpointResolver,
} from "@bernouy/cms-relations";
import { makeEndpointUrn, parseUrn, type Source } from "@bernouy/cms-sources";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationRelationWrite } from "../relationWrites";
import type { IntegrationImportDeps, IntegrationImportOptions } from "../../../interfaces/IntegrationImport";

export async function buildRelationWrites(
    deps: IntegrationImportDeps,
    relations: CmsRelation[],
    sourceArtifacts: Source[],
    options: IntegrationImportOptions,
): Promise<IntegrationRelationWrite[]> {
    if (!relations.length) {
        return [];
    }
    if (!deps.relations) {
        throw new IntegrationRuntimeError("relation repository not configured");
    }

    const relationWrites: IntegrationRelationWrite[] = [];
    const seen = new Set<string>();
    const resolveEndpoint = relationSourceResolver(deps, sourceArtifacts);
    for (const relation of relations) {
        if (seen.has(relation.id)) {
            throw new DuplicateRelationError(relation.id);
        }
        seen.add(relation.id);

        const errors = await validateRelationSources(relation, resolveEndpoint);
        if (errors.length) {
            throw new IntegrationInputError("artifacts", errors.join("; "));
        }
        const previous = await deps.relations.getRelation(relation.id);
        if (!options.force && previous) {
            throw new DuplicateRelationError(relation.id);
        }
        relationWrites.push({ relation, previous });
    }
    return relationWrites;
}

function relationSourceResolver(deps: IntegrationImportDeps, sourceArtifacts: Source[]): RelationEndpointResolver {
    const sourceById = new Map(sourceArtifacts.map((source) => [sourceId(source), source]));
    return async (sourceId, endpointId) => {
        const endpointUrn = makeEndpointUrn(sourceId, endpointId);
        const source = sourceById.get(sourceId);
        if (source) {
            return source.endpoints.find((endpoint) => endpoint.urn === endpointUrn) ?? null;
        }
        return deps.sources.getEndpoint(endpointUrn);
    };
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? source.urn;
}
