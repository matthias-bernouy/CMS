import type { Source, SourceEndpoint } from "cms-sources/interfaces/Source";
import { SOURCE_INDEXING_VARIABLE_TYPES, type SourceIndexingEntity } from "cms-sources/interfaces/SourceIndexing";
import { sourceEndpointAccessMode } from "../../execution/access";
import { validateIndexingPagination } from "./pagination";
import { discoveryItems, responseScalarType, validateItemPath, validateResponsePath } from "./paths";

export function validateSourceIndexing(source: Source, errors: string[]): void {
    if (!source.indexing) {
        return;
    }
    if (!source.indexing.entities.length) {
        errors.push("source.indexing.entities must not be empty");
        return;
    }
    const seen = new Set<string>();
    for (const entity of source.indexing.entities) {
        const prefix = `invalid indexing entity "${entity.id}"`;
        if (!entity.id.trim()) {
            errors.push("invalid indexing entity: id must not be empty");
        } else if (seen.has(entity.id)) {
            errors.push(`${prefix}: duplicate entity id`);
        }
        seen.add(entity.id);
        validateEntity(source, entity, prefix, errors);
    }
}

function validateEntity(source: Source, entity: SourceIndexingEntity, prefix: string, errors: string[]): void {
    const resolution = indexingEndpoint(source, entity.resolve.endpointUrn, `${prefix}.resolve`, errors);
    const discovery = indexingEndpoint(source, entity.discover.endpointUrn, `${prefix}.discover`, errors);
    const identity = entity.resolve.identity;
    if (!identity.key.trim()) {
        errors.push(`${prefix}.resolve.identity.key must not be empty`);
    }
    const identityParam = resolution?.input?.params?.find((param) => param.name === identity.inputParam);
    if (
        !identityParam ||
        identityParam.source?.from === "computed" ||
        (identityParam.schema.type !== "string" && identityParam.schema.type !== "number")
    ) {
        errors.push(`${prefix}.resolve.identity.inputParam must name a request string or number parameter`);
    }
    const identityType = resolution ? responseScalarType(resolution, identity.outputPath) : undefined;
    if (resolution) {
        if (!identityType) {
            errors.push(`${prefix}.resolve.identity.outputPath must reference a declared scalar response value`);
        }
        validateRequiredParams(resolution, new Set([identity.inputParam]), `${prefix}.resolve`, errors);
        validateVariables(resolution, entity, prefix, errors);
    }
    if (discovery) {
        const itemShapes = discoveryItems(discovery, entity.discover.itemsPath);
        if (!entity.discover.itemsPath.trim() || !itemShapes.length) {
            errors.push(`${prefix}.discover.itemsPath must reference a declared response array`);
        } else {
            validateItemPath(
                itemShapes,
                entity.discover.identityPath,
                identityType ?? "scalar",
                `${prefix}.discover.identityPath`,
                errors,
            );
            if (entity.discover.lastModifiedPath !== undefined) {
                validateItemPath(
                    itemShapes,
                    entity.discover.lastModifiedPath,
                    "string",
                    `${prefix}.discover.lastModifiedPath`,
                    errors,
                );
            }
        }
        validateIndexingPagination(discovery, entity.discover.pagination, prefix, errors);
    }
    validateDefaults(entity, prefix, errors);
}

function validateVariables(
    endpoint: SourceEndpoint,
    entity: SourceIndexingEntity,
    prefix: string,
    errors: string[],
): void {
    for (const [name, variable] of Object.entries(entity.variables)) {
        if (!name.trim()) {
            errors.push(`${prefix}.variables contains an empty variable name`);
        }
        if (!(SOURCE_INDEXING_VARIABLE_TYPES as readonly string[]).includes(variable.type)) {
            errors.push(`${prefix}.variables.${name}.type is invalid`);
            continue;
        }
        validateResponsePath(
            endpoint,
            variable.path,
            variable.type === "number" ? "number" : "string",
            `${prefix}.variables.${name}.path`,
            errors,
        );
    }
}

function indexingEndpoint(
    source: Source,
    endpointUrn: string,
    path: string,
    errors: string[],
): SourceEndpoint | undefined {
    const endpoint = source.endpoints.find((candidate) => candidate.urn === endpointUrn);
    if (!endpoint) {
        errors.push(`${path}.endpointUrn references unknown endpoint "${endpointUrn}"`);
        return undefined;
    }
    if (endpoint.method !== "GET" || endpoint.responseKind === "file") {
        errors.push(`${path}.endpointUrn must reference a GET JSON endpoint`);
    }
    if (sourceEndpointAccessMode(endpoint) !== "public") {
        errors.push(`${path}.endpointUrn must reference a public endpoint`);
    }
    if ((endpoint.input?.params ?? []).some((param) => param.source?.from === "computed")) {
        errors.push(`${path}.endpointUrn must not depend on computed request parameters`);
    }
    return endpoint;
}

function validateRequiredParams(endpoint: SourceEndpoint, allowed: Set<string>, path: string, errors: string[]): void {
    for (const param of endpoint.input?.params ?? []) {
        if (param.required && param.source?.from !== "computed" && !allowed.has(param.name)) {
            errors.push(`${path}.endpointUrn has unsupported required parameter "${param.name}"`);
        }
    }
}

function validateDefaults(entity: SourceIndexingEntity, prefix: string, errors: string[]): void {
    if (entity.defaults?.titleTemplate !== undefined && !entity.defaults.titleTemplate.trim()) {
        errors.push(`${prefix}.defaults.titleTemplate must not be empty`);
    }
    if (entity.defaults?.descriptionTemplate !== undefined && !entity.defaults.descriptionTemplate.trim()) {
        errors.push(`${prefix}.defaults.descriptionTemplate must not be empty`);
    }
}
