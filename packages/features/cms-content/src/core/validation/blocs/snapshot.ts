import { ContentValidationError } from "cms-content/core/validation/errors";
import type { SiteBlocNode, SiteBlocSlot, SiteBlocSnapshot } from "cms-content/interfaces/blocs";

export function validateSiteBlocSnapshot(value: SiteBlocSnapshot, ownerTag?: string): SiteBlocSnapshot {
    if (!isRecord(value)) {
        throw new ContentValidationError("draft", "object expected");
    }
    if (typeof value.name !== "string" || !value.name.trim()) {
        throw new ContentValidationError("draft.name", "required");
    }
    if (
        typeof value.group !== "string" ||
        typeof value.description !== "string" ||
        !Array.isArray(value.structure) ||
        !Array.isArray(value.slots) ||
        typeof value.defaultContent !== "string"
    ) {
        throw new ContentValidationError("draft", "text metadata, structure, slots and defaultContent are required");
    }
    const slotIds = validateSlots(value.slots);
    const dependencies = new Set<string>();
    value.structure.forEach((node, index) => validateNode(node, `draft.structure.${index}`, slotIds, dependencies));
    if (ownerTag && dependencies.has(ownerTag)) {
        throw new ContentValidationError("draft.structure", "a site bloc cannot reference itself");
    }
    return {
        name: value.name.trim(),
        group: value.group.trim(),
        description: value.description.trim(),
        structure: structuredClone(value.structure),
        slots: structuredClone(value.slots),
        defaultContent: value.defaultContent,
        dependencies: [...dependencies].sort(),
    };
}

function validateSlots(slots: SiteBlocSlot[]): Set<string> {
    const ids = new Set<string>();
    const names = new Set<string>();
    let defaultSlot = false;
    for (const slot of slots) {
        if (!isRecord(slot)) {
            throw new ContentValidationError("draft.slots", "slot object expected");
        }
        if (typeof slot.id !== "string" || !slot.id.trim() || ids.has(slot.id)) {
            throw new ContentValidationError("draft.slots", `duplicate or empty slot id "${slot.id}"`);
        }
        ids.add(slot.id);
        if (typeof slot.label !== "string" || !slot.label.trim()) {
            throw new ContentValidationError(`draft.slots.${slot.id}.label`, "required");
        }
        if (slot.slot !== undefined) {
            if (typeof slot.slot !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slot.slot)) {
                throw new ContentValidationError(
                    `draft.slots.${slot.id}.slot`,
                    "lower-case kebab-case identifier expected",
                );
            }
            if (names.has(slot.slot)) {
                throw new ContentValidationError("draft.slots", `duplicate slot name "${slot.slot}"`);
            }
            names.add(slot.slot);
        } else if (defaultSlot) {
            throw new ContentValidationError("draft.slots", "only one default slot is allowed");
        } else {
            defaultSlot = true;
        }
        validateCardinality(slot);
        if (!Array.isArray(slot.accepts) || slot.accepts.length === 0) {
            throw new ContentValidationError(`draft.slots.${slot.id}.accepts`, "at least one rule is required");
        }
        slot.accepts.forEach((accept, index) => validateAccept(slot.id, accept, index));
    }
    return ids;
}

function validateCardinality(slot: SiteBlocSlot): void {
    for (const [field, value] of [
        ["min", slot.min],
        ["max", slot.max],
    ] as const) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
            throw new ContentValidationError(`draft.slots.${slot.id}.${field}`, "non-negative integer expected");
        }
    }
    if (slot.min !== undefined && slot.max !== undefined && slot.min > slot.max) {
        throw new ContentValidationError(`draft.slots.${slot.id}`, "min cannot exceed max");
    }
}

function validateNode(node: SiteBlocNode, field: string, slotIds: Set<string>, dependencies: Set<string>): void {
    if (!isRecord(node)) {
        throw new ContentValidationError(field, "node object expected");
    }
    if (node.kind === "slot") {
        if (!slotIds.has(node.slotId)) {
            throw new ContentValidationError(field, `unknown slot id "${node.slotId}"`);
        }
        return;
    }
    if (node.kind !== "bloc") {
        throw new ContentValidationError(field, 'expected node kind "bloc" or "slot"');
    }
    if (!isRegisteredBlocTag(node.tag)) {
        throw new ContentValidationError(field, `invalid bloc tag "${node.tag}"`);
    }
    if (!node.attributes || typeof node.attributes !== "object" || Array.isArray(node.attributes)) {
        throw new ContentValidationError(field, "attributes object expected");
    }
    if (Object.values(node.attributes).some((value) => typeof value !== "string")) {
        throw new ContentValidationError(field, "attribute values must be strings");
    }
    if (!Array.isArray(node.children)) {
        throw new ContentValidationError(field, "children array expected");
    }
    dependencies.add(node.tag);
    node.children.forEach((child, index) => validateNode(child, `${field}.children.${index}`, slotIds, dependencies));
}

function validateAccept(slotId: string, accept: SiteBlocSlot["accepts"][number], index: number): void {
    const field = `draft.slots.${slotId}.accepts.${index}`;
    if (!isRecord(accept)) {
        throw new ContentValidationError(field, "acceptance rule object expected");
    }
    if (accept.kind === "any-component") {
        return;
    }
    if (accept.kind === "component") {
        if (typeof accept.tag !== "string" || !isRegisteredBlocTag(accept.tag)) {
            throw new ContentValidationError(field, "valid bloc tag expected");
        }
        return;
    }
    if (accept.kind === "media") {
        if (accept.accept !== undefined) {
            const allowed = new Set(["image", "bitmap", "svg", "video", "audio", "document"]);
            if (!Array.isArray(accept.accept) || accept.accept.some((value) => !allowed.has(value))) {
                throw new ContentValidationError(field, "valid media types expected");
            }
        }
        return;
    }
    throw new ContentValidationError(field, 'expected "component", "any-component" or "media"');
}

function isRegisteredBlocTag(value: string): boolean {
    return typeof value === "string" && /^[a-z][a-z0-9-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
