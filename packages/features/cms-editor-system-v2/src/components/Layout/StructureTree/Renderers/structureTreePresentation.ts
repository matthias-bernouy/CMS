import { CMS_BINDING_ATTRIBUTES, CMS_SOURCE_STATES } from "@bernouy/cms-content/editor";
import type { EditorStructureNode, StructureNode } from "../../../../runtime";

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
    if ((CMS_SOURCE_STATES as readonly string[]).includes(value)) {
        return `badge source-status ${value}`;
    }
    return value === "Source" || value === "Repeat" ? "badge data" : "badge";
}

export function structureBadgeIcon(value: string): string | null {
    if (value === "Source") {
        return "▦";
    }
    if (value === "Repeat") {
        return "↻";
    }
    return null;
}

export function structureIconText(node: StructureNode): string {
    if (node.icon) {
        return node.icon.slice(0, 1).toUpperCase();
    }
    return node.label.slice(0, 1).toUpperCase();
}

export function structureNodeLabel(node: StructureNode): string {
    return node.label;
}

export function structureRowClass(_node: StructureNode): string {
    return "row";
}

export function structureItemClass(_node: StructureNode): string {
    return "item";
}

export function structureIconClass(_node: StructureNode): string {
    return "icon";
}

export function sourceActionLabel(node: EditorStructureNode): string {
    return node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source) ? "Update source" : "Add source";
}
