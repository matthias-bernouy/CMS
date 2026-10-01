import type { SiteBlocDefinition, SiteBlocNode, SiteBlocSlot, SiteBlocSnapshot } from "@bernouy/cms-content";

type SlotAccept = SiteBlocSlot["accepts"][number];

export function normalizeSiteBlocSnapshot(snapshot: SiteBlocSnapshot): SiteBlocSnapshot {
    return {
        name: normalizeLineEndings(snapshot.name),
        group: normalizeLineEndings(snapshot.group),
        description: normalizeLineEndings(snapshot.description),
        structure: snapshot.structure.map(normalizeNode),
        slots: snapshot.slots.map(normalizeSlot),
        defaultContent: normalizeLineEndings(snapshot.defaultContent),
        dependencies: snapshot.dependencies.map(normalizeLineEndings).sort(compareText),
    };
}

export function canonicalSiteBlocDefinition(definition: SiteBlocDefinition): string {
    const normalized = {
        schema: definition.schema,
        ...(definition.collectionId ? { collectionId: definition.collectionId } : {}),
        id: definition.id,
        tag: definition.tag,
        ownership: definition.ownership,
        lifecycle: definition.lifecycle,
        draftRevision: definition.draftRevision,
        publishedRevision: definition.publishedRevision,
        draft: normalizeSiteBlocSnapshot(definition.draft),
        published: definition.published ? normalizeSiteBlocSnapshot(definition.published) : null,
        createdAt: isoDate(definition.createdAt, "createdAt"),
        updatedAt: isoDate(definition.updatedAt, "updatedAt"),
        ...(definition.archivedAt ? { archivedAt: isoDate(definition.archivedAt, "archivedAt") } : {}),
    };
    return canonicalJson(normalized);
}

export function canonicalJson(value: unknown): string {
    return `${JSON.stringify(sortJsonValue(value), null, 4)}\n`;
}

export function normalizeLineEndings(value: string): string {
    return value.replace(/\r\n?/g, "\n");
}

function normalizeNode(node: SiteBlocNode): SiteBlocNode {
    if (node.kind === "text") {
        return { kind: "text", value: normalizeLineEndings(node.value) };
    }
    if (node.kind === "slot") {
        return { kind: "slot", slotId: normalizeLineEndings(node.slotId) };
    }
    if (node.kind !== "bloc") {
        throw new Error("Unsupported site bloc structure node");
    }
    return {
        kind: "bloc",
        tag: normalizeLineEndings(node.tag),
        attributes: Object.fromEntries(
            Object.entries(node.attributes)
                .map(([name, value]) => [name, normalizeLineEndings(value)] as const)
                .sort(([left], [right]) => compareText(left, right)),
        ),
        children: node.children.map(normalizeNode),
    };
}

function normalizeSlot(slot: SiteBlocSlot): SiteBlocSlot {
    return {
        id: normalizeLineEndings(slot.id),
        label: normalizeLineEndings(slot.label),
        ...(slot.slot !== undefined ? { slot: normalizeLineEndings(slot.slot) } : {}),
        ...(slot.min !== undefined ? { min: slot.min } : {}),
        ...(slot.max !== undefined ? { max: slot.max } : {}),
        accepts: slot.accepts
            .map(normalizeAccept)
            .sort((left, right) => compareText(acceptKey(left), acceptKey(right))),
    };
}

function normalizeAccept(accept: SlotAccept): SlotAccept {
    if (accept.kind !== "media" || !accept.accept) {
        return { ...accept };
    }
    return { ...accept, accept: [...accept.accept].sort(compareText) };
}

function acceptKey(accept: SlotAccept): string {
    if (accept.kind === "component") {
        return `component:${accept.tag}`;
    }
    if (accept.kind === "media") {
        return `media:${accept.accept?.join(",") ?? ""}`;
    }
    return "any-component";
}

function sortJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJsonValue);
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right));
    return Object.fromEntries(entries.map(([key, item]) => [key, sortJsonValue(item)]));
}

function isoDate(value: Date, field: string): string {
    if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
        throw new Error(`Invalid site bloc ${field}`);
    }
    return value.toISOString();
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
