import type {
    CmsRelation,
    LinkTableRelationBinding,
    ReferenceRelationBinding,
    RelationBinding,
    RelationSide,
} from "../../interfaces/Relation";
import { RELATION_CARDINALITIES } from "../../interfaces/Relation";
import {
    MAX_RELATION_LIMIT,
    isRecord,
    validateExpressionMap,
    validateId,
    validatePath,
    validateEndpointRefShape,
    validateRequiredId,
    validateRequiredPath,
} from "./primitives";

export function validateRelation(relation: CmsRelation): string[] {
    const errors: string[] = [];
    validateRequiredId("relation.id", relation.id, errors);
    if (relation.label !== undefined && !relation.label.trim()) {
        errors.push("relation.label must be non-empty when provided");
    }
    validateSide(relation.from, "relation.from", errors);
    validateSide(relation.to, "relation.to", errors);
    if (!(RELATION_CARDINALITIES as readonly string[]).includes(relation.cardinality)) {
        errors.push("relation.cardinality must be one or many");
    }
    validateBinding(relation.binding, "relation.binding", errors);
    validatePage(relation, errors);
    return errors;
}

function validateSide(side: RelationSide, path: string, errors: string[]): void {
    if (!isRecord(side)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateRequiredId(`${path}.sourceId`, side.sourceId, errors);
    if (side.label !== undefined && !side.label.trim()) {
        errors.push(`${path}.label must be non-empty when provided`);
    }
    validatePath(`${path}.idPath`, side.idPath, errors);
}

function validateBinding(binding: RelationBinding, path: string, errors: string[]): void {
    if (!isRecord(binding)) {
        errors.push(`${path} must be an object`);
        return;
    }
    if (binding.kind === "reference") {
        return validateReferenceBinding(binding, path, errors);
    }
    if (binding.kind === "linkTable") {
        return validateLinkTableBinding(binding, path, errors);
    }
    errors.push(`${path}.kind must be reference or linkTable`);
}

function validateReferenceBinding(binding: ReferenceRelationBinding, path: string, errors: string[]): void {
    validateEndpointRefShape(binding.endpoint, `${path}.endpoint`, errors);
    if (!isRecord(binding.params)) {
        errors.push(`${path}.params must be an object`);
        return;
    }
    validateExpressionMap(binding.params, `${path}.params`, errors);
}

function validateLinkTableBinding(binding: LinkTableRelationBinding, path: string, errors: string[]): void {
    validateRequiredId(`${path}.sourceId`, binding.sourceId, errors);
    validateRequiredId(`${path}.listEndpointId`, binding.listEndpointId, errors);
    validateId(`${path}.createEndpointId`, binding.createEndpointId, errors);
    validateId(`${path}.deleteEndpointId`, binding.deleteEndpointId, errors);
    validateRequiredId(`${path}.fromIdParam`, binding.fromIdParam, errors);
    validateRequiredId(`${path}.toIdParam`, binding.toIdParam, errors);
    validateRequiredPath(`${path}.itemsPath`, binding.itemsPath, errors);
    validateRequiredPath(`${path}.targetIdPath`, binding.targetIdPath, errors);
    if (!binding.target) {
        return;
    }
    validateRequiredId(`${path}.target.sourceId`, binding.target.sourceId, errors);
    validateRequiredId(`${path}.target.endpointId`, binding.target.endpointId, errors);
    validateRequiredId(`${path}.target.idParam`, binding.target.idParam, errors);
    validateId(`${path}.target.batchEndpointId`, binding.target.batchEndpointId, errors);
    validateId(`${path}.target.batchIdsParam`, binding.target.batchIdsParam, errors);
    validatePath(`${path}.target.batchItemsPath`, binding.target.batchItemsPath, errors);
}

function validatePage(relation: CmsRelation, errors: string[]): void {
    const page = relation.page;
    if (relation.cardinality === "one") {
        if (page) {
            errors.push("relation.page is only supported for many relations");
        }
        return;
    }
    if (!page) {
        errors.push("many relations must declare page");
        return;
    }
    validateRequiredPath("relation.page.itemsPath", page.itemsPath, errors);
    validatePath("relation.page.totalPath", page.totalPath, errors);
    validateId("relation.page.limitParam", page.limitParam, errors);
    validateId("relation.page.offsetParam", page.offsetParam, errors);
    validateId("relation.page.cursorParam", page.cursorParam, errors);
    validatePath("relation.page.nextCursorPath", page.nextCursorPath, errors);
    if (!page.limitParam) {
        errors.push("relation.page.limitParam is required for many relations");
    }
    if (page.offsetParam && page.cursorParam) {
        errors.push("relation.page must not declare both offsetParam and cursorParam");
    }
    if (page.cursorParam && !page.nextCursorPath) {
        errors.push("relation.page.nextCursorPath is required when cursorParam is used");
    }
    validateLimit("relation.page.defaultLimit", page.defaultLimit, errors);
    validateLimit("relation.page.maxLimit", page.maxLimit, errors);
    if (page.defaultLimit !== undefined && page.maxLimit !== undefined && page.defaultLimit > page.maxLimit) {
        errors.push("relation.page.defaultLimit must be less than or equal to maxLimit");
    }
}

function validateLimit(path: string, value: number | undefined, errors: string[]): void {
    if (value === undefined) {
        return;
    }
    if (!Number.isInteger(value) || value < 1 || value > MAX_RELATION_LIMIT) {
        errors.push(`${path} must be an integer between 1 and ${MAX_RELATION_LIMIT}`);
    }
}
