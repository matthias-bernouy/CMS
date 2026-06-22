import {
    CMS_BINDING_ATTRIBUTES,
    CMS_SNIPPET_TAG,
} from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../../BlockPickerModal/BlockPickerModal";
import type {
    EditorStructureNode,
    SourceStateStructureNode,
    StructureNode,
} from "../../../../runtime";

export function renderStructureBadge(value: string): HTMLElement {
    const badge = document.createElement("span");
    badge.className = structureBadgeClass(value);

    const icon = structureBadgeIcon(value);
    if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "badge-icon";
        iconEl.textContent = icon;
        badge.append(iconEl);
    }

    const label = document.createElement("span");
    label.textContent = value;
    badge.append(label);
    return badge;
}

export function structureBadgeClass(value: string): string {
    return value === "Source" || value === "Repeat" ? "badge data" : "badge";
}

export function structureBadgeIcon(value: string): string | null {
    if (value === "Source") return "▦";
    if (value === "Repeat") return "↻";
    return null;
}

export function structureIconText(node: StructureNode, isSourceStateNode: (node: StructureNode) => node is SourceStateStructureNode): string {
    if (isSourceStateNode(node)) return "";
    if (node.icon) return node.icon.slice(0, 1).toUpperCase();
    return node.label.slice(0, 1).toUpperCase();
}

export function structureNodeLabel(node: StructureNode, isSourceStateNode: (node: StructureNode) => node is SourceStateStructureNode): string {
    if (!isSourceStateNode(node)) return node.label;
    return node.label;
}

export function structureRowClass(node: StructureNode, isSourceStateNode: (node: StructureNode) => node is SourceStateStructureNode): string {
    if (isSourceStateNode(node)) return "row source-state-row";
    return "row";
}

export function structureItemClass(node: StructureNode, isSourceStateNode: (node: StructureNode) => node is SourceStateStructureNode): string {
    if (isSourceStateNode(node)) {
        return node.children.length > 0
            ? `item source-state state-filled state-${node.state}`
            : `item source-state state-${node.state}`;
    }
    return "item";
}

export function structureIconClass(node: StructureNode, isSourceStateNode: (node: StructureNode) => node is SourceStateStructureNode): string {
    if (isSourceStateNode(node)) return "icon state-spacer";
    return "icon";
}

export function sourceActionLabel(node: EditorStructureNode): string {
    return node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source) ? "Update source" : "Add source";
}

export function isSnippetNode(node: EditorStructureNode): boolean {
    return node.tag.toLowerCase() === CMS_SNIPPET_TAG;
}

export function snippetItemForNode(node: EditorStructureNode, items: BlockPickerItem[]): Extract<BlockPickerItem, { kind: "snippet" }> | null {
    if (!isSnippetNode(node)) return null;

    const identifier = node.target.getAttribute("identifier")?.trim();
    if (!identifier) return null;

    return items.find((item): item is Extract<BlockPickerItem, { kind: "snippet" }> =>
        item.kind === "snippet" && item.identifier === identifier) ?? null;
}
