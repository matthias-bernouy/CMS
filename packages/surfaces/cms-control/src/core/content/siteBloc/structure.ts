import { randomUUIDv7 } from "bun";
import { ContentValidationError, hardenStoredHtml, type SiteBlocNode, type SiteBlocSlot } from "@bernouy/cms-content";
import type { MediaAccept } from "@bernouy/cms-content/editor";
import { parseHTML } from "linkedom";

export const SITE_SLOT_PLACEHOLDER_TAG = "cms-site-slot-placeholder";

const MEDIA_TYPES = new Set(["image", "bitmap", "svg", "video", "audio", "document"]);

export function parseSiteBlocStructure(html: string): { structure: SiteBlocNode[]; slots: SiteBlocSlot[] } {
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = hardenStoredHtml(html);
    const slots: SiteBlocSlot[] = [];
    const slotIds = new Set<string>();
    const structure = parseChildren(document.body, slots, slotIds, "structure");
    return { structure, slots };
}

export function hardenSiteBlocStructure(
    structure: SiteBlocNode[],
    slots: SiteBlocSlot[],
): { structure: SiteBlocNode[]; slots: SiteBlocSlot[] } {
    return parseSiteBlocStructure(siteBlocStructureHtml(structure, slots, new Set()));
}

export function siteBlocStructureHtml(
    structure: SiteBlocNode[],
    slots: SiteBlocSlot[],
    publishedIds: Set<string>,
): string {
    const byId = new Map(slots.map((slot) => [slot.id, slot]));
    return structure.map((node) => serializeEditorNode(node, byId, publishedIds)).join("");
}

function parseChildren(parent: Element, slots: SiteBlocSlot[], slotIds: Set<string>, path: string): SiteBlocNode[] {
    const nodes: SiteBlocNode[] = [];
    for (const [index, child] of Array.from(parent.childNodes).entries()) {
        if (child.nodeType === child.TEXT_NODE) {
            const value = child.textContent ?? "";
            if (value.trim()) {
                appendText(nodes, value);
            }
            continue;
        }
        if (child.nodeType !== child.ELEMENT_NODE) {
            continue;
        }
        const element = child as Element;
        if (element.localName === SITE_SLOT_PLACEHOLDER_TAG) {
            const slot = parseSlot(element, slotIds);
            slots.push(slot);
            nodes.push({ kind: "slot", slotId: slot.id });
            continue;
        }
        nodes.push({
            kind: "bloc",
            tag: element.localName,
            attributes: Object.fromEntries(Array.from(element.attributes).map(({ name, value }) => [name, value])),
            children: parseChildren(element, slots, slotIds, `${path}.${index}.children`),
        });
    }
    return nodes;
}

function appendText(nodes: SiteBlocNode[], value: string): void {
    const previous = nodes.at(-1);
    if (previous?.kind === "text") {
        previous.value += value;
        return;
    }
    nodes.push({ kind: "text", value });
}

function parseSlot(element: Element, ids: Set<string>): SiteBlocSlot {
    let id = element.getAttribute("data-slot-id")?.trim() ?? "";
    if (!id || ids.has(id)) {
        id = randomUUIDv7();
    }
    ids.add(id);
    const label = element.getAttribute("data-slot-label")?.trim() ?? "";
    const name = element.getAttribute("data-slot-name")?.trim() ?? "";
    const min = optionalCount(element, "data-slot-min");
    const max = optionalCount(element, "data-slot-max");
    return {
        id,
        label,
        ...(name ? { slot: name } : {}),
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
        accepts: parseAccepts(element),
    };
}

function parseAccepts(element: Element): SiteBlocSlot["accepts"] {
    const mode = element.getAttribute("data-slot-kind") ?? "any-component";
    if (mode === "components") {
        return csv(element, "data-slot-tags").map((tag) => ({ kind: "component", tag }));
    }
    if (mode === "media") {
        const values = csv(element, "data-slot-media");
        const invalid = values.find((item) => !MEDIA_TYPES.has(item));
        if (invalid) {
            throw new ContentValidationError("data-slot-media", `unknown media type "${invalid}"`);
        }
        const accept = values as MediaAccept[];
        return [{ kind: "media", ...(accept.length > 0 ? { accept } : {}) }];
    }
    if (mode === "any-component") {
        return [{ kind: "any-component" }];
    }
    throw new ContentValidationError("data-slot-kind", `unknown acceptance mode "${mode}"`);
}

function optionalCount(element: Element, attribute: string): number | undefined {
    const raw = element.getAttribute(attribute)?.trim();
    if (!raw) {
        return undefined;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new ContentValidationError(attribute, "non-negative integer expected");
    }
    return value;
}

function csv(element: Element, attribute: string): string[] {
    return [
        ...new Set(
            (element.getAttribute(attribute) ?? "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    ];
}

function serializeEditorNode(node: SiteBlocNode, slots: Map<string, SiteBlocSlot>, publishedIds: Set<string>): string {
    if (node.kind === "text") {
        return escapeText(node.value);
    }
    if (node.kind === "slot") {
        const slot = slots.get(node.slotId);
        if (!slot) {
            throw new ContentValidationError("structure", `unknown slot id "${node.slotId}"`);
        }
        return serializeSlot(slot, publishedIds.has(slot.id));
    }
    const attributes = Object.entries(node.attributes)
        .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
        .join("");
    const children = node.children.map((child) => serializeEditorNode(child, slots, publishedIds)).join("");
    return `<${node.tag}${attributes}>${children}</${node.tag}>`;
}

function serializeSlot(slot: SiteBlocSlot, published: boolean): string {
    const componentTags = slot.accepts.filter((item) => item.kind === "component").map((item) => item.tag);
    const media = slot.accepts.find((item) => item.kind === "media");
    const mode = media ? "media" : componentTags.length > 0 ? "components" : "any-component";
    const attributes: Record<string, string> = {
        "data-slot-id": slot.id,
        "data-slot-label": slot.label,
        "data-slot-kind": mode,
        ...(slot.slot ? { "data-slot-name": slot.slot } : {}),
        ...(componentTags.length > 0 ? { "data-slot-tags": componentTags.join(", ") } : {}),
        ...(media?.accept ? { "data-slot-media": media.accept.join(", ") } : {}),
        ...(slot.min !== undefined ? { "data-slot-min": String(slot.min) } : {}),
        ...(slot.max !== undefined ? { "data-slot-max": String(slot.max) } : {}),
        ...(published ? { "data-published-slot": "" } : {}),
    };
    const serialized = Object.entries(attributes)
        .map(([name, value]) => (value ? ` ${name}="${escapeAttribute(value)}"` : ` ${name}`))
        .join("");
    return `<${SITE_SLOT_PLACEHOLDER_TAG}${serialized}></${SITE_SLOT_PLACEHOLDER_TAG}>`;
}

function escapeAttribute(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeText(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
