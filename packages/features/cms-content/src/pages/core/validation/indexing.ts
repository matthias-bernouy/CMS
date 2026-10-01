import type { PageIndexingConfiguration } from "cms-content/pages/interfaces/pages";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { validateLabel } from "cms-content/application/core/validation/fields";
import { isCmsQueryParamName } from "cms-content/blocs/core/markup/bindings";

const MAX_INDEXING_REFERENCE_LENGTH = 512;
const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/u;
const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/u;

export function validatePageIndexingConfiguration(value: unknown): PageIndexingConfiguration {
    if (!isRecord(value)) {
        throw new ContentValidationError("indexing", "object expected");
    }
    if (typeof value.enabled !== "boolean") {
        throw new ContentValidationError("indexing.enabled", "boolean expected");
    }
    if (value.entity === undefined) {
        return { enabled: value.enabled };
    }
    if (!isRecord(value.entity)) {
        throw new ContentValidationError("indexing.entity", "object expected");
    }

    const contractId = indexingIdentifier(value.entity.contractId, "indexing.entity.contractId");
    const label = requiredIndexingText(value.entity.label, "indexing.entity.label");
    const pageQueryParam = requiredIndexingText(value.entity.pageQueryParam, "indexing.entity.pageQueryParam");
    if (!isCmsQueryParamName(pageQueryParam)) {
        throw new ContentValidationError("indexing.entity.pageQueryParam", "invalid CMS query parameter name");
    }

    const resolve = value.entity.resolve;
    if (!isRecord(resolve)) {
        throw new ContentValidationError("indexing.entity.resolve", "object expected");
    }
    const validatedResolve = {
        capabilityId: indexingIdentifier(resolve.capabilityId, "indexing.entity.resolve.capabilityId"),
        inputParam: indexingPath(resolve.inputParam, "indexing.entity.resolve.inputParam"),
        identityPath: indexingPath(resolve.identityPath, "indexing.entity.resolve.identityPath"),
    };
    const discover = value.entity.discover === undefined ? undefined : validateIndexingDiscovery(value.entity.discover);
    if (!isRecord(value.entity.variables) || Object.keys(value.entity.variables).length > 32) {
        throw new ContentValidationError("indexing.entity.variables", "expected at most 32 variables");
    }
    const variables: NonNullable<PageIndexingConfiguration["entity"]>["variables"] = {};
    for (const [name, variable] of Object.entries(value.entity.variables)) {
        if (!FIELD_PATH.test(name) || name.includes(".") || !isRecord(variable)) {
            throw new ContentValidationError("indexing.entity.variables", "invalid variable");
        }
        const type = variable.type;
        if (type !== "text" && type !== "url" && type !== "image" && type !== "date" && type !== "number") {
            throw new ContentValidationError(`indexing.entity.variables.${name}.type`, "invalid variable type");
        }
        variables[name] = { path: indexingPath(variable.path, `indexing.entity.variables.${name}.path`), type };
    }
    return {
        enabled: value.enabled,
        entity: {
            contractId,
            label,
            pageQueryParam,
            resolve: validatedResolve,
            ...(discover ? { discover } : {}),
            variables,
        },
    };
}

function validateIndexingDiscovery(
    value: unknown,
): NonNullable<NonNullable<PageIndexingConfiguration["entity"]>["discover"]> {
    if (!isRecord(value)) {
        throw new ContentValidationError("indexing.entity.discover", "object expected");
    }
    const pagination = value.pagination;
    let validatedPagination:
        | NonNullable<NonNullable<NonNullable<PageIndexingConfiguration["entity"]>["discover"]>["pagination"]>
        | undefined;
    if (pagination !== undefined) {
        if (!isRecord(pagination)) {
            throw new ContentValidationError("indexing.entity.discover.pagination", "object expected");
        }
        if (pagination.type === "offset") {
            const pageSize = indexingPageSize(pagination.pageSize);
            validatedPagination = {
                type: "offset",
                limitParam: indexingPath(pagination.limitParam, "indexing.entity.discover.pagination.limitParam"),
                offsetParam: indexingPath(pagination.offsetParam, "indexing.entity.discover.pagination.offsetParam"),
                pageSize,
                ...(pagination.totalPath === undefined
                    ? {}
                    : {
                          totalPath: indexingPath(
                              pagination.totalPath,
                              "indexing.entity.discover.pagination.totalPath",
                          ),
                      }),
            };
        } else if (pagination.type === "cursor") {
            if ((pagination.limitParam === undefined) !== (pagination.pageSize === undefined)) {
                throw new ContentValidationError(
                    "indexing.entity.discover.pagination",
                    "limitParam and pageSize must be paired",
                );
            }
            validatedPagination = {
                type: "cursor",
                cursorParam: indexingPath(pagination.cursorParam, "indexing.entity.discover.pagination.cursorParam"),
                nextCursorPath: indexingPath(
                    pagination.nextCursorPath,
                    "indexing.entity.discover.pagination.nextCursorPath",
                ),
                ...(pagination.limitParam === undefined
                    ? {}
                    : {
                          limitParam: indexingPath(
                              pagination.limitParam,
                              "indexing.entity.discover.pagination.limitParam",
                          ),
                          pageSize: indexingPageSize(pagination.pageSize),
                      }),
            };
        } else {
            throw new ContentValidationError("indexing.entity.discover.pagination.type", "invalid pagination type");
        }
    }
    return {
        capabilityId: indexingIdentifier(value.capabilityId, "indexing.entity.discover.capabilityId"),
        itemsPath: indexingPath(value.itemsPath, "indexing.entity.discover.itemsPath"),
        identityPath: indexingPath(value.identityPath, "indexing.entity.discover.identityPath"),
        ...(value.lastModifiedPath === undefined
            ? {}
            : { lastModifiedPath: indexingPath(value.lastModifiedPath, "indexing.entity.discover.lastModifiedPath") }),
        ...(validatedPagination ? { pagination: validatedPagination } : {}),
    };
}

function indexingIdentifier(value: unknown, field: string): string {
    const text = requiredIndexingText(value, field);
    if (text.length > 128 || !CAPABILITY_ID.test(text)) {
        throw new ContentValidationError(field, "invalid capability identifier");
    }
    return text;
}

function indexingPath(value: unknown, field: string): string {
    const text = requiredIndexingText(value, field);
    if (
        !FIELD_PATH.test(text) ||
        text.split(".").some((part) => ["__proto__", "constructor", "prototype"].includes(part))
    ) {
        throw new ContentValidationError(field, "invalid field path");
    }
    return text;
}

function indexingPageSize(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1000) {
        throw new ContentValidationError("indexing.entity.discover.pagination.pageSize", "must be between 1 and 1000");
    }
    return value as number;
}

function requiredIndexingText(value: unknown, field: string): string {
    if (typeof value !== "string") {
        throw new ContentValidationError(field, "string expected");
    }
    return validateLabel(field, value, MAX_INDEXING_REFERENCE_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
