import {
    MAX_SOURCE_INDEXING_PAGE_SIZE,
    SOURCE_INDEXING_VARIABLE_TYPES,
    type SourceIndexingDto,
    type SourceIndexingEntityDto,
    type SourceIndexingPagination,
    type SourceIndexingVariable,
} from "@bernouy/cms-sources";
import { IntegrationInputError } from "../../../errors";
import { isRecord } from "../../definition/values";
import { optionalText, requiredText } from "../common";

export function parseSourceIndexing(value: unknown, name: string): SourceIndexingDto {
    const indexing = record(value, name);
    if (!Array.isArray(indexing.entities)) {
        throw new IntegrationInputError(`${name}.entities`, "must be an array");
    }
    if (!indexing.entities.length) {
        throw new IntegrationInputError(`${name}.entities`, "must not be empty");
    }
    return {
        entities: indexing.entities.map((entity, index) => parseEntity(entity, `${name}.entities.${index}`)),
    };
}

function parseEntity(value: unknown, name: string): SourceIndexingEntityDto {
    const entity = record(value, name);
    const resolve = record(entity.resolve, `${name}.resolve`);
    const identity = record(resolve.identity, `${name}.resolve.identity`);
    const discover = record(entity.discover, `${name}.discover`);
    return {
        id: requiredText(entity.id, `${name}.id`),
        resolve: {
            endpointId: requiredText(resolve.endpointId, `${name}.resolve.endpointId`),
            identity: {
                key: requiredText(identity.key, `${name}.resolve.identity.key`),
                inputParam: requiredText(identity.inputParam, `${name}.resolve.identity.inputParam`),
                outputPath: requiredText(identity.outputPath, `${name}.resolve.identity.outputPath`),
            },
        },
        discover: {
            endpointId: requiredText(discover.endpointId, `${name}.discover.endpointId`),
            itemsPath: requiredText(discover.itemsPath, `${name}.discover.itemsPath`),
            identityPath: requiredText(discover.identityPath, `${name}.discover.identityPath`),
            ...(discover.pagination !== undefined
                ? { pagination: parsePagination(discover.pagination, `${name}.discover.pagination`) }
                : {}),
            ...(optionalText(discover.lastModifiedPath, `${name}.discover.lastModifiedPath`)
                ? { lastModifiedPath: optionalText(discover.lastModifiedPath, `${name}.discover.lastModifiedPath`)! }
                : {}),
        },
        variables: parseVariables(entity.variables, `${name}.variables`),
        ...(entity.defaults !== undefined ? { defaults: parseDefaults(entity.defaults, `${name}.defaults`) } : {}),
    };
}

function parseVariables(value: unknown, name: string): Record<string, SourceIndexingVariable> {
    const variables = record(value, name);
    return Object.fromEntries(
        Object.entries(variables).map(([key, variable]) => {
            if (!key.trim()) {
                throw new IntegrationInputError(name, "variable names must not be empty");
            }
            const definition = record(variable, `${name}.${key}`);
            const type = requiredText(definition.type, `${name}.${key}.type`);
            if (!(SOURCE_INDEXING_VARIABLE_TYPES as readonly string[]).includes(type)) {
                throw new IntegrationInputError(
                    `${name}.${key}.type`,
                    `must be ${SOURCE_INDEXING_VARIABLE_TYPES.join("|")}`,
                );
            }
            return [
                key,
                {
                    path: requiredText(definition.path, `${name}.${key}.path`),
                    type: type as SourceIndexingVariable["type"],
                },
            ];
        }),
    );
}

function parseDefaults(value: unknown, name: string): NonNullable<SourceIndexingEntityDto["defaults"]> {
    const defaults = record(value, name);
    const titleTemplate = optionalText(defaults.titleTemplate, `${name}.titleTemplate`);
    const descriptionTemplate = optionalText(defaults.descriptionTemplate, `${name}.descriptionTemplate`);
    return {
        ...(titleTemplate ? { titleTemplate } : {}),
        ...(descriptionTemplate ? { descriptionTemplate } : {}),
    };
}

function parsePagination(value: unknown, name: string): SourceIndexingPagination {
    const pagination = record(value, name);
    const type = requiredText(pagination.type, `${name}.type`);
    if (type === "offset") {
        return {
            type,
            limitParam: requiredText(pagination.limitParam, `${name}.limitParam`),
            offsetParam: requiredText(pagination.offsetParam, `${name}.offsetParam`),
            pageSize: pageSize(pagination.pageSize, `${name}.pageSize`, true)!,
            ...(optionalText(pagination.totalPath, `${name}.totalPath`)
                ? { totalPath: optionalText(pagination.totalPath, `${name}.totalPath`)! }
                : {}),
        };
    }
    if (type === "cursor") {
        const limitParam = optionalText(pagination.limitParam, `${name}.limitParam`);
        const size = pageSize(pagination.pageSize, `${name}.pageSize`, false);
        if ((limitParam === undefined) !== (size === undefined)) {
            throw new IntegrationInputError(name, "limitParam and pageSize must be declared together");
        }
        return {
            type,
            cursorParam: requiredText(pagination.cursorParam, `${name}.cursorParam`),
            nextCursorPath: requiredText(pagination.nextCursorPath, `${name}.nextCursorPath`),
            ...(limitParam ? { limitParam, pageSize: size! } : {}),
        };
    }
    throw new IntegrationInputError(`${name}.type`, "must be offset or cursor");
}

function pageSize(value: unknown, name: string, required: boolean): number | undefined {
    if (value === undefined && !required) {
        return undefined;
    }
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_SOURCE_INDEXING_PAGE_SIZE) {
        throw new IntegrationInputError(name, `must be an integer between 1 and ${MAX_SOURCE_INDEXING_PAGE_SIZE}`);
    }
    return value as number;
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return value;
}
