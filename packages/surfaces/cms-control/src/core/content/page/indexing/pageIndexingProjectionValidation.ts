import type { PageIndexingConfiguration } from "@bernouy/cms-content";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";
import type { UlviaSchema } from "@bernouy/cms-repository/contracts/schema";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

type Entity = NonNullable<PageIndexingConfiguration["entity"]>;

/** Rejects projection paths that the selected contract release cannot return. */
export function validateIndexingProjection(
    entity: Entity,
    resolved: GatewayEditorCapability,
    capabilities: readonly GatewayEditorCapability[],
): void {
    if (resolved.effect !== "query" || !isIdentity(schemaAtPath(resolved.input, entity.resolve.inputParam))) {
        throw new InvalidParam("indexingProjection", "The resolver input must be a query identity field.");
    }
    if (!isIdentity(schemaAtPath(resolved.output, entity.resolve.identityPath))) {
        throw new InvalidParam(
            "indexingProjection",
            "The canonical identity field is absent from the response contract.",
        );
    }
    const discovery = entity.discover;
    if (!discovery) {
        return;
    }
    const listed = capabilities.find(
        (capability) =>
            capability.contractId === entity.contractId && capability.capabilityId === discovery.capabilityId,
    );
    if (!listed || listed.access !== "public" || listed.effect !== "query") {
        throw new InvalidParam("indexingProjection", "Choose a public query capability from the selected contract.");
    }
    const items = schemaAtPath(listed.output, discovery.itemsPath);
    if (items?.type !== "array" || !isIdentity(schemaAtPath(items.items, discovery.identityPath))) {
        throw new InvalidParam("indexingProjection", "The list response does not declare those item fields.");
    }
    if (discovery.lastModifiedPath && schemaAtPath(items.items, discovery.lastModifiedPath)?.type !== "string") {
        throw new InvalidParam("indexingProjection", "The last modified field must be a string in the list contract.");
    }
    const pagination = discovery.pagination;
    if (!pagination) {
        return;
    }
    if (pagination.type === "offset") {
        if (
            !isNumber(schemaAtPath(listed.input, pagination.limitParam)) ||
            !isNumber(schemaAtPath(listed.input, pagination.offsetParam)) ||
            (pagination.totalPath && !isNumber(schemaAtPath(listed.output, pagination.totalPath)))
        ) {
            throw new InvalidParam("indexingProjection", "Offset pagination does not match the list contract.");
        }
    } else if (
        schemaAtPath(listed.input, pagination.cursorParam)?.type !== "string" ||
        schemaAtPath(listed.output, pagination.nextCursorPath)?.type !== "string" ||
        (pagination.limitParam && !isNumber(schemaAtPath(listed.input, pagination.limitParam)))
    ) {
        throw new InvalidParam("indexingProjection", "Cursor pagination does not match the list contract.");
    }
}

function schemaAtPath(schema: UlviaSchema, path: string): UlviaSchema | undefined {
    let current: UlviaSchema | undefined = schema;
    for (const part of path.split(".")) {
        current = current?.type === "object" ? current.properties[part] : undefined;
    }
    return current;
}

function isIdentity(schema: UlviaSchema | undefined): boolean {
    return schema?.type === "string" || isNumber(schema);
}

function isNumber(schema: UlviaSchema | undefined): boolean {
    return schema?.type === "integer" || schema?.type === "number";
}
