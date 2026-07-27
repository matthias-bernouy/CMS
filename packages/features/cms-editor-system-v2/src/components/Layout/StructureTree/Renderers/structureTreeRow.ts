import type { Editor } from "@bernouy/cms-content/editor";
import type { EditorStructureNode, StructureNode } from "../../../../runtime";

export type StructureTreeRowRenderContext = {
    selectedEditor: Editor | null;
    clearDragState(): void;
    clearDropRow(): void;
    iconClass(node: StructureNode): string;
    iconText(node: StructureNode): string;
    isCollapsed(node: StructureNode): boolean;
    itemClass(node: StructureNode): string;
    nodeLabel(node: StructureNode): string;
    onDragOver(node: EditorStructureNode, row: HTMLElement, event: DragEvent): void;
    onDragStart(node: EditorStructureNode, event: DragEvent): void;
    onDrop(node: EditorStructureNode, event: DragEvent): void;
    openContextMenu(node: StructureNode, clientX: number, clientY: number, focusMenu?: boolean): void;
    renderBadge(value: string): HTMLElement;
    rowClass(node: StructureNode): string;
    selectEditor(editor: Editor): void;
    toggleBadges(node: StructureNode): void;
    toggleNode(node: StructureNode): void;
    trackRenderedRow(node: StructureNode, row: HTMLElement): void;
    visibleBadges(node: StructureNode): string[];
};

export function renderStructureTreeRow(
    node: StructureNode,
    depth: number,
    context: StructureTreeRowRenderContext,
): HTMLElement {
    const row = document.createElement("div");
    row.className = context.rowClass(node);
    row.style.setProperty("--structure-depth", String(depth));
    context.trackRenderedRow(node, row);

    appendToggle(row, node, context);

    const item = document.createElement("button");
    item.className = context.itemClass(node);
    item.draggable = true;
    if (node.editor === context.selectedEditor) {
        item.classList.add("selected");
    }
    item.type = "button";
    item.addEventListener("click", () => {
        context.selectEditor(node.editor);
    });
    item.addEventListener("contextmenu", (event) => {
        const mouseEvent = event as MouseEvent;
        event.preventDefault();
        event.stopPropagation();
        context.openContextMenu(node, mouseEvent.clientX, mouseEvent.clientY);
    });
    item.addEventListener("keydown", (event) => {
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
            return;
        }
        event.preventDefault();
        const bounds = item.getBoundingClientRect();
        context.openContextMenu(node, bounds.left, bounds.bottom, true);
    });
    item.addEventListener("dragstart", (event) => context.onDragStart(node, event as DragEvent));
    item.addEventListener("dragover", (event) => context.onDragOver(node, row, event as DragEvent));
    item.addEventListener("dragleave", () => context.clearDropRow());
    item.addEventListener("drop", (event) => context.onDrop(node, event as DragEvent));
    item.addEventListener("dragend", () => context.clearDragState());

    const icon = document.createElement("span");
    icon.className = context.iconClass(node);
    icon.textContent = context.iconText(node);

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = context.nodeLabel(node);

    const badges = document.createElement("span");
    badges.className = "badges";
    appendBadges(badges, node, context);

    item.append(icon, label, badges);
    row.append(item, actionsButton(node, context));

    return row;
}

function actionsButton(node: StructureNode, context: StructureTreeRowRenderContext): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "row-actions";
    button.type = "button";
    button.textContent = "⋯";
    button.setAttribute("aria-label", `Actions for ${context.nodeLabel(node)}`);
    button.setAttribute("aria-haspopup", "menu");
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const bounds = button.getBoundingClientRect();
        context.openContextMenu(node, bounds.left, bounds.bottom, true);
    });
    return button;
}

function appendToggle(row: HTMLElement, node: StructureNode, context: StructureTreeRowRenderContext): void {
    if (node.children.length > 0) {
        const toggle = document.createElement("button");
        toggle.className = "toggle";
        toggle.type = "button";
        toggle.textContent = context.isCollapsed(node) ? "›" : "⌄";
        toggle.setAttribute("aria-label", context.isCollapsed(node) ? "Expand" : "Collapse");
        toggle.addEventListener("click", () => {
            context.toggleNode(node);
        });
        row.append(toggle);
    } else {
        const spacer = document.createElement("span");
        spacer.className = "toggle-spacer";
        row.append(spacer);
    }
}

function appendBadges(badges: HTMLElement, node: StructureNode, context: StructureTreeRowRenderContext): void {
    const visibleBadges = context.visibleBadges(node);
    for (const value of visibleBadges) {
        badges.append(context.renderBadge(value));
    }
    const hiddenCount = node.badges.length - visibleBadges.length;
    if (hiddenCount > 0) {
        const more = document.createElement("span");
        more.className = "badge more";
        more.role = "button";
        more.tabIndex = 0;
        more.textContent = `+${hiddenCount}`;
        more.addEventListener("click", (event) => {
            event.stopPropagation();
            context.toggleBadges(node);
        });
        more.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            context.toggleBadges(node);
        });
        badges.append(more);
    }
}
