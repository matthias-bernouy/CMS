import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    CMS_BINDING_RUNTIME_ATTRIBUTES,
} from "@bernouy/cms-content/editor";
import type { SiteBlocNode, SiteBlocSlot, SiteBlocSnapshot } from "@bernouy/cms-content";

const TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ATTRIBUTE = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;
const DYNAMIC_TOKEN = /(?:\{\{|#\{|@\{)/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const BINDING_ATTRIBUTES = new Set<string>([
    ...Object.values(CMS_BINDING_ATTRIBUTES),
    ...Object.values(CMS_BINDING_RUNTIME_ATTRIBUTES),
]);
const VOID_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);

export function serializeSiteBlocTemplate(snapshot: SiteBlocSnapshot): string {
    const slots = slotMap(snapshot.slots);
    const usedSlots = new Set<string>();
    const html = snapshot.structure.map((node) => serializeNode(node, slots, usedSlots)).join("");
    for (const slot of snapshot.slots) {
        if (!usedSlots.has(slot.id)) {
            throw new Error(`Site bloc slot "${slot.id}" has no placeholder`);
        }
    }
    return `${html}\n`;
}

export function serializeSiteBlocDefault(tag: string, content: string): string {
    assertTag(tag);
    return `<${tag}>${normalizeFragment(content)}</${tag}>\n`;
}

function serializeNode(node: SiteBlocNode, slots: Map<string, SiteBlocSlot>, usedSlots: Set<string>): string {
    if (node.kind === "text") {
        assertStaticValue(node.value, "text");
        return escapeText(node.value);
    }
    if (node.kind === "slot") {
        const slot = slots.get(node.slotId);
        if (!slot) {
            throw new Error(`Unknown site bloc slot placeholder "${node.slotId}"`);
        }
        if (usedSlots.has(node.slotId)) {
            throw new Error(`Duplicate site bloc slot placeholder "${node.slotId}"`);
        }
        usedSlots.add(node.slotId);
        return slot.slot ? `<slot name="${escapeAttribute(slot.slot)}"></slot>` : "<slot></slot>";
    }
    if (node.kind !== "bloc") {
        throw new Error("Unsupported site bloc structure node");
    }

    assertTag(node.tag);
    if (node.tag === CMS_BINDING_CORE_TAG) {
        throw new Error(`Binding runtime tag "${node.tag}" is forbidden in a site bloc structure`);
    }
    if (VOID_TAGS.has(node.tag) && node.children.length > 0) {
        throw new Error(`Void element "${node.tag}" cannot contain site bloc children`);
    }
    const attributes = Object.entries(node.attributes)
        .sort(([left], [right]) => compareText(left, right))
        .map(([name, value]) => serializeAttribute(name, value))
        .join("");
    const opening = `<${node.tag}${attributes}>`;
    if (VOID_TAGS.has(node.tag)) {
        return opening;
    }
    const children = node.children.map((child) => serializeNode(child, slots, usedSlots)).join("");
    return `${opening}${children}</${node.tag}>`;
}

function serializeAttribute(name: string, value: string): string {
    if (!ATTRIBUTE.test(name)) {
        throw new Error(`Invalid site bloc attribute name "${name}"`);
    }
    const normalized = name.toLowerCase();
    if (normalized === "style" || normalized.startsWith("on") || BINDING_ATTRIBUTES.has(normalized)) {
        throw new Error(`Site bloc attribute "${name}" is forbidden in the private structure`);
    }
    assertStaticValue(value, `attribute "${name}"`);
    return ` ${name}="${escapeAttribute(value)}"`;
}

function slotMap(slots: SiteBlocSlot[]): Map<string, SiteBlocSlot> {
    const result = new Map<string, SiteBlocSlot>();
    for (const slot of slots) {
        if (result.has(slot.id)) {
            throw new Error(`Duplicate site bloc slot id "${slot.id}"`);
        }
        result.set(slot.id, slot);
    }
    return result;
}

function assertTag(tag: string): void {
    if (!TAG.test(tag)) {
        throw new Error(`Invalid site bloc HTML tag "${tag}"`);
    }
}

function assertStaticValue(value: string, label: string): void {
    if (DYNAMIC_TOKEN.test(value)) {
        throw new Error(`Dynamic expression is forbidden in site bloc ${label}`);
    }
    if (CONTROL_CHARACTER.test(value)) {
        throw new Error(`Control character is forbidden in site bloc ${label}`);
    }
}

function escapeText(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
    assertStaticValue(value, "attribute value");
    return escapeText(value).replaceAll('"', "&quot;");
}

function normalizeFragment(value: string): string {
    return value.replace(/\r\n?/g, "\n");
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
