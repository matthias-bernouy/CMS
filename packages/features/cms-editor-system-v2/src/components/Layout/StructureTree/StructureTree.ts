import type {
    ContentSlot,
    ContentSlotAccept,
    Editor,
    EditorCatalog,
    EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import {
    BLOCK_PICKER_SELECT_EVENT,
    type BlockPickerModal,
    type BlockPickerOption,
    type BlockPickerSlotGroup,
    type BlockPickerSelectDetail,
} from "../BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type StructureTreeAction = "add-child" | "duplicate" | "delete" | "replace";

export type StructureTreeActionDetail = {
    action: StructureTreeAction;
    editor: Editor;
    entry?: EditorCatalogEntry;
    slot?: string;
};

export type StructureTreeRenderOptions = {
    scrollSelectedIntoView?: boolean;
};

export class StructureTree extends HTMLElement {
    private _nodes: EditorStructureNode[] = [];
    private _selectedEditor: Editor | null = null;
    private _catalog: EditorCatalog = [];
    private _scrollSelectedIntoViewOnRender = false;
    private _pendingPickerAction: { action: "add-child" | "replace"; editor: Editor } | null = null;
    private readonly _collapsedTargets = new Set<HTMLElement>();
    private readonly _expandedBadgeTargets = new Set<HTMLElement>();

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.ownerDocument.addEventListener("click", this._closeContextMenu);
        this.ownerDocument.addEventListener("keydown", this._onDocumentKeydown);
        this._blockPicker.addEventListener(BLOCK_PICKER_SELECT_EVENT, this._onBlockPickerSelect as EventListener);
    }

    disconnectedCallback(): void {
        this.ownerDocument.removeEventListener("click", this._closeContextMenu);
        this.ownerDocument.removeEventListener("keydown", this._onDocumentKeydown);
        this._blockPicker.removeEventListener(BLOCK_PICKER_SELECT_EVENT, this._onBlockPickerSelect as EventListener);
    }

    setCatalog(catalog: EditorCatalog): void {
        this.catalog = catalog;
    }

    get catalog(): EditorCatalog {
        return this._catalog;
    }

    set catalog(catalog: EditorCatalog) {
        this._catalog = [...catalog];
    }

    setStructure(
        nodes: EditorStructureNode[],
        selectedEditor: Editor | null = null,
        catalog: EditorCatalog = this._catalog,
        options: StructureTreeRenderOptions = {},
    ): void {
        this._nodes = nodes;
        this._selectedEditor = selectedEditor;
        this._catalog = [...catalog];
        this._scrollSelectedIntoViewOnRender = options.scrollSelectedIntoView === true;
        this._render();
    }

    private _render(): void {
        const tree = this.shadowRoot!.querySelector<HTMLElement>(".structure-tree")!;
        const scrollContainer = this._scrollContainer;
        const previousScrollTop = scrollContainer.scrollTop;
        tree.replaceChildren();
        this._contextMenu.remove();

        if (this._nodes.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No editable elements";
            tree.append(empty);
            return;
        }

        for (const node of this._visibleNodes(this._nodes)) {
            tree.append(this._renderNode(node.item, node.depth));
        }

        if (this._scrollSelectedIntoViewOnRender) {
            this._scrollSelectedIntoView();
        } else {
            scrollContainer.scrollTop = previousScrollTop;
        }
    }

    private _renderNode(node: EditorStructureNode, depth: number): HTMLElement {
        const row = document.createElement("div");
        row.className = "row";
        row.style.setProperty("--structure-depth", String(depth));

        if (node.children.length > 0) {
            const toggle = document.createElement("button");
            toggle.className = "toggle";
            toggle.type = "button";
            toggle.textContent = this._isCollapsed(node) ? "›" : "⌄";
            toggle.setAttribute("aria-label", this._isCollapsed(node) ? "Expand" : "Collapse");
            toggle.addEventListener("click", () => {
                this._toggleNode(node);
            });
            row.append(toggle);
        } else {
            const spacer = document.createElement("span");
            spacer.className = "toggle-spacer";
            row.append(spacer);
        }

        const button = document.createElement("button");
        button.className = "item";
        if (node.editor === this._selectedEditor) button.classList.add("selected");
        button.type = "button";
        button.addEventListener("click", () => {
            this.dispatchEvent(new CustomEvent("editor-v2:select-editor", {
                bubbles: true,
                composed: true,
                detail: { editor: node.editor },
            }));
        });
        button.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._openContextMenu(node, event.clientX, event.clientY);
        });

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = this._iconText(node);

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = node.label;

        const badges = document.createElement("span");
        badges.className = "badges";
        const visibleBadges = this._visibleBadges(node);
        for (const value of visibleBadges) {
            const badge = document.createElement("span");
            badge.className = "badge";
            badge.textContent = value;
            badges.append(badge);
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
                this._toggleBadges(node);
            });
            more.addEventListener("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                this._toggleBadges(node);
            });
            badges.append(more);
        }

        button.append(icon, label, badges);
        row.append(button);

        return row;
    }

    private _scrollSelectedIntoView(): void {
        if (!this._selectedEditor) return;

        requestAnimationFrame(() => {
            const selected = this.shadowRoot!.querySelector<HTMLElement>(".item.selected");
            if (!selected) return;

            const scrollContainer = this._scrollContainer;
            const selectedTop = selected.offsetTop;
            const targetOffset = scrollContainer.clientHeight * 0.2;
            const nextScrollTop = selectedTop - targetOffset + selected.offsetHeight / 2;

            scrollContainer.scrollTo({
                top: Math.max(0, nextScrollTop),
                behavior: "smooth",
            });
        });
    }

    private _openContextMenu(node: EditorStructureNode, clientX: number, clientY: number): void {
        this._closeContextMenu();

        const menu = this._contextMenu;
        menu.replaceChildren();

        menu.append(
            this._contextMenuButton("Add child", () => {
                this._pendingPickerAction = { action: "add-child", editor: node.editor };
                this._blockPicker.open(this._childGroups(node), node.label);
            }, undefined, !this._hasEnabledGroup(this._childGroups(node))),
            this._contextMenuButton("Replace", () => {
                this._pendingPickerAction = { action: "replace", editor: node.editor };
                this._blockPicker.open(this._replaceGroups(node), node.label);
            }, undefined, !this._hasEnabledGroup(this._replaceGroups(node))),
            this._contextMenuButton("Duplicate", () => this._emitAction("duplicate", node.editor), undefined, !this._canDuplicate(node)),
            this._contextMenuButton("Delete", () => this._emitAction("delete", node.editor), "danger", !this._canDelete(node)),
        );

        this.shadowRoot!.append(menu);
        this._positionContextMenu(menu, clientX, clientY);
    }

    private _positionContextMenu(menu: HTMLElement, clientX: number, clientY: number): void {
        const margin = 6;
        const menuBounds = menu.getBoundingClientRect();
        const maxLeft = Math.max(margin, window.innerWidth - menuBounds.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - menuBounds.height - margin);

        menu.style.left = `${Math.min(Math.max(clientX, margin), maxLeft)}px`;
        menu.style.top = `${Math.min(Math.max(clientY, margin), maxTop)}px`;
    }

    private _contextMenuButton(
        label: string,
        action: () => void,
        variant?: "danger",
        disabled = false,
    ): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = variant ? `context-item ${variant}` : "context-item";
        button.type = "button";
        button.disabled = disabled;
        button.textContent = label;
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (button.disabled) return;
            this._closeContextMenu();
            action();
        });
        return button;
    }

    private _emitAction(action: StructureTreeAction, editor: Editor, entry?: EditorCatalogEntry, slot?: string): void {
        this.dispatchEvent(new CustomEvent<StructureTreeActionDetail>("editor-v2:structure-action", {
            bubbles: true,
            composed: true,
            detail: { action, editor, entry, slot },
        }));
    }

    private _childGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return node.editor.getContentSlots().map(slot => {
            const isFull = this._isSlotFull(node, slot);
            const options = isFull ? [] : this._slotOptions(slot);

            return {
                slot: slot.slot,
                label: slot.label,
                disabledReason: isFull ? "This slot is full." : options.length === 0 ? "No compatible blocks." : undefined,
                options,
            };
        });
    }

    private _replaceGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        const parent = this._parentNode(node);
        if (!parent) return [];

        const slot = this._slotForChild(parent, node);
        if (!slot) return [];

        const options = this._slotOptions(slot);

        return [{
            slot: slot.slot,
            label: slot.label,
            disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
            options,
        }];
    }

    private _slotOptions(slot: ContentSlot): BlockPickerOption[] {
        return this._catalog.filter(entry => {
            if (entry.category === "Runtime") return false;
            return slot.accepts.some(accept => this._acceptsEntry(accept, entry));
        }).map(entry => ({
            entry,
            slot: slot.slot,
            slotLabel: slot.label,
        }));
    }

    private _hasEnabledGroup(groups: BlockPickerSlotGroup[]): boolean {
        return groups.some(group => !group.disabledReason && group.options.length > 0);
    }

    private _acceptsEntry(accept: ContentSlotAccept, entry: EditorCatalogEntry): boolean {
        if (accept.kind === "any-component") return true;
        return accept.tag.toLowerCase() === entry.tag.toLowerCase();
    }

    private _canDuplicate(node: EditorStructureNode): boolean {
        const parent = this._parentNode(node);
        if (!parent) return true;

        const slot = this._slotForChild(parent, node);
        if (!slot?.max) return true;

        return this._slotChildCount(parent, slot) < slot.max;
    }

    private _canDelete(node: EditorStructureNode): boolean {
        const parent = this._parentNode(node);
        if (!parent) return true;

        const slot = this._slotForChild(parent, node);
        if (!slot?.min) return true;

        return this._slotChildCount(parent, slot) > slot.min;
    }

    private _isSlotFull(parent: EditorStructureNode, slot: ContentSlot): boolean {
        return typeof slot.max === "number" && this._slotChildCount(parent, slot) >= slot.max;
    }

    private _slotForChild(parent: EditorStructureNode, child: EditorStructureNode): ContentSlot | undefined {
        const childSlot = child.target.getAttribute("slot") ?? undefined;
        return parent.editor.getContentSlots().find(slot => (slot.slot ?? undefined) === childSlot);
    }

    private _slotChildCount(parent: EditorStructureNode, slot: ContentSlot): number {
        return parent.children.filter(child => (child.target.getAttribute("slot") ?? undefined) === (slot.slot ?? undefined)).length;
    }

    private _parentNode(child: EditorStructureNode): EditorStructureNode | null {
        const visit = (nodes: EditorStructureNode[]): EditorStructureNode | null => {
            for (const node of nodes) {
                if (node.children.includes(child)) return node;
                const parent = visit(node.children);
                if (parent) return parent;
            }
            return null;
        };

        return visit(this._nodes);
    }

    private readonly _onBlockPickerSelect = (event: CustomEvent<BlockPickerSelectDetail>): void => {
        if (!this._pendingPickerAction) return;
        const { action, editor } = this._pendingPickerAction;
        this._emitAction(action, editor, event.detail.option.entry, event.detail.option.slot);
        this._pendingPickerAction = null;
    };

    private readonly _closeContextMenu = (): void => {
        this._contextMenu.remove();
    };

    private readonly _onDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") this._closeContextMenu();
    };

    private _visibleNodes(nodes: EditorStructureNode[], depth = 0): { item: EditorStructureNode; depth: number }[] {
        return nodes.flatMap(node => {
            const current = [{ item: node, depth }];
            if (this._isCollapsed(node)) return current;
            return [
                ...current,
                ...this._visibleNodes(node.children, depth + 1),
            ];
        });
    }

    private _toggleNode(node: EditorStructureNode): void {
        if (this._isCollapsed(node)) {
            this._collapsedTargets.delete(node.target);
        } else {
            this._collapsedTargets.add(node.target);
        }
        this._render();
    }

    private _isCollapsed(node: EditorStructureNode): boolean {
        return this._collapsedTargets.has(node.target);
    }

    private _visibleBadges(node: EditorStructureNode): string[] {
        if (this._areBadgesExpanded(node)) return node.badges;
        return node.badges.slice(0, 2);
    }

    private _toggleBadges(node: EditorStructureNode): void {
        if (this._areBadgesExpanded(node)) {
            this._expandedBadgeTargets.delete(node.target);
        } else {
            this._expandedBadgeTargets.add(node.target);
        }
        this._render();
    }

    private _areBadgesExpanded(node: EditorStructureNode): boolean {
        return this._expandedBadgeTargets.has(node.target);
    }

    private _iconText(node: EditorStructureNode): string {
        if (node.icon) return node.icon.slice(0, 1).toUpperCase();
        return node.label.slice(0, 1).toUpperCase();
    }

    private get _contextMenu(): HTMLElement {
        let menu = this.shadowRoot!.querySelector<HTMLElement>(".context-menu");
        if (!menu) {
            menu = document.createElement("div");
            menu.className = "context-menu";
            menu.setAttribute("role", "menu");
        }
        return menu;
    }

    private get _scrollContainer(): HTMLElement {
        const panelBody = this.parentElement?.shadowRoot?.querySelector<HTMLElement>(".panel-body");
        if (panelBody) return panelBody;

        return this;
    }

    private get _blockPicker(): BlockPickerModal {
        let picker = this.shadowRoot!.querySelector<BlockPickerModal>("cms-editor-v2-block-picker-modal");
        if (!picker) {
            picker = document.createElement("cms-editor-v2-block-picker-modal") as BlockPickerModal;
            this.shadowRoot!.append(picker);
        }
        return picker;
    }
}

if (!customElements.get("cms-editor-v2-structure-tree")) {
    customElements.define("cms-editor-v2-structure-tree", StructureTree);
}
