import type { Editor } from "@bernouy/cms-content/editor";
import type {
    EditorStructureNode,
    SourceStateStructureNode,
    StructureNode,
} from "../../../../runtime";

export type StructureTreeRowRenderContext = {
    selectedEditor: Editor | null;
    clearDragState(): void;
    clearDropRow(): void;
    iconClass(node: StructureNode): string;
    iconText(node: StructureNode): string;
    isCollapsed(node: StructureNode): boolean;
    isSourceStateNode(node: StructureNode): node is SourceStateStructureNode;
    itemClass(node: StructureNode): string;
    nodeLabel(node: StructureNode): string;
    onDragOver(node: EditorStructureNode, row: HTMLElement, event: DragEvent): void;
    onDragStart(node: EditorStructureNode, event: DragEvent): void;
    onDrop(node: EditorStructureNode, event: DragEvent): void;
    openContextMenu(node: StructureNode, clientX: number, clientY: number): void;
    renderBadge(value: string): HTMLElement;
    rowClass(node: StructureNode): string;
    selectEditor(editor: Editor): void;
    sourceStateAddButton(node: SourceStateStructureNode): HTMLButtonElement;
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

    const item = context.isSourceStateNode(node)
        ? document.createElement("div")
        : document.createElement("button");
    item.className = context.itemClass(node);
    item.draggable = !context.isSourceStateNode(node);
    if (!context.isSourceStateNode(node) && node.editor === context.selectedEditor) item.classList.add("selected");
    if (!context.isSourceStateNode(node)) (item as HTMLButtonElement).type = "button";
    item.addEventListener("click", () => {
        if (context.isSourceStateNode(node)) return;
        context.selectEditor(node.editor);
    });
    item.addEventListener("contextmenu", (event) => {
        const mouseEvent = event as MouseEvent;
        event.preventDefault();
        event.stopPropagation();
        context.openContextMenu(node, mouseEvent.clientX, mouseEvent.clientY);
    });
    if (!context.isSourceStateNode(node)) {
        item.addEventListener("dragstart", (event) => context.onDragStart(node, event as DragEvent));
        item.addEventListener("dragover", (event) => context.onDragOver(node, row, event as DragEvent));
        item.addEventListener("dragleave", () => context.clearDropRow());
        item.addEventListener("drop", (event) => context.onDrop(node, event as DragEvent));
        item.addEventListener("dragend", () => context.clearDragState());
    }

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
    row.append(item);

    return row;
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
    } else if (context.isSourceStateNode(node)) {
        row.append(document.createElement("span"));
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
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            context.toggleBadges(node);
        });
        badges.append(more);
    }

    if (context.isSourceStateNode(node) && node.children.length === 0) {
        badges.append(context.sourceStateAddButton(node));
    }
}
