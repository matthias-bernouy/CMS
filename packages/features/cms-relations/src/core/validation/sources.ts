import {
    makeEndpointUrn,
    type SourceEndpoint,
    type SourceRepository,
} from "@bernouy/cms-sources";
import type {
    CmsRelation,
    ReferenceRelationBinding,
    RelationEndpointRef,
} from "../../interfaces/Relation";
import { validateRelation } from "./relation";
import {
    validateEndpointRefShape,
    isString,
} from "./primitives";

export type RelationEndpointResolver = (sourceId: string, endpointId: string) => Promise<SourceEndpoint | null>;

export async function validateRelationSources(
    relation: CmsRelation,
    resolver: RelationEndpointResolver | SourceRepository,
): Promise<string[]> {
    const errors: string[] = validateRelation(relation);
    const resolve = endpointResolver(resolver);

    if (relation.binding.kind === "reference") {
        await validateEndpointRef(relation.binding.endpoint, `${relation.id}.binding.endpoint`, resolve, errors);
        const endpoint = await resolve(relation.binding.endpoint.sourceId, relation.binding.endpoint.endpointId);
        if (endpoint) validateReferenceEndpointContract(relation, relation.binding, endpoint, errors);
        return errors;
    }

    const binding = relation.binding;
    await validateEndpointRef({ sourceId: binding.sourceId, endpointId: binding.listEndpointId }, `${relation.id}.binding.listEndpointId`, resolve, errors);
    const list = await resolve(binding.sourceId, binding.listEndpointId);
    if (list) validateEndpointParams(list, [binding.fromIdParam], `${relation.id}.binding`, errors);
    if (binding.createEndpointId) {
        await validateEndpointRef({ sourceId: binding.sourceId, endpointId: binding.createEndpointId }, `${relation.id}.binding.createEndpointId`, resolve, errors);
    }
    if (binding.deleteEndpointId) {
        await validateEndpointRef({ sourceId: binding.sourceId, endpointId: binding.deleteEndpointId }, `${relation.id}.binding.deleteEndpointId`, resolve, errors);
    }
    if (binding.target) {
        await validateEndpointRef({ sourceId: binding.target.sourceId, endpointId: binding.target.endpointId }, `${relation.id}.binding.target.endpointId`, resolve, errors);
        if (binding.target.batchEndpointId) {
            await validateEndpointRef({ sourceId: binding.target.sourceId, endpointId: binding.target.batchEndpointId }, `${relation.id}.binding.target.batchEndpointId`, resolve, errors);
        }
    }
    return errors;
}

export function sourceRepositoryRelationResolver(repository: SourceRepository): RelationEndpointResolver {
    return (sourceId, endpointId) => repository.getEndpoint(makeEndpointUrn(sourceId, endpointId));
}

function endpointResolver(resolver: RelationEndpointResolver | SourceRepository): RelationEndpointResolver {
    return typeof resolver === "function" ? resolver : sourceRepositoryRelationResolver(resolver);
}

async function validateEndpointRef(
    ref: RelationEndpointRef,
    path: string,
    resolve: RelationEndpointResolver,
    errors: string[],
): Promise<void> {
    validateEndpointRefShape(ref, path, errors);
    if (!ref.sourceId || !ref.endpointId) return;
    const endpoint = await resolve(ref.sourceId, ref.endpointId);
    if (!endpoint) errors.push(`${path} references unknown endpoint "${ref.sourceId}.${ref.endpointId}"`);
    else if (endpoint.method !== "GET") errors.push(`${path} must reference a GET endpoint`);
}

function validateReferenceEndpointContract(
    relation: CmsRelation,
    binding: ReferenceRelationBinding,
    endpoint: SourceEndpoint,
    errors: string[],
): void {
    validateEndpointParams(endpoint, Object.keys(binding.params), `${relation.id}.binding.params`, errors);
    const page = relation.page;
    if (!page) return;
    validateEndpointParams(endpoint, [page.limitParam, page.offsetParam, page.cursorParam].filter(isString), `${relation.id}.page`, errors);
}

function validateEndpointParams(endpoint: SourceEndpoint, params: string[], path: string, errors: string[]): void {
    const declared = new Set((endpoint.input?.params ?? []).map(param => param.name));
    for (const param of params) {
        if (!declared.has(param)) errors.push(`${path}.${param} is not declared by endpoint "${endpoint.urn}"`);
    }
}
