import {
    CMS_BINDING_ATTRIBUTES,
    CMS_SNIPPET_TAG,
} from "@bernouy/cms-content/editor";
import "../DataSourcePicker/DataSourcePicker";
import type {
    ContentSlot,
    ContentSlotAccept,
    Editor,
    EditorCatalog,
    EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import {
    BLOCK_PICKER_SELECT_EVENT,
    type BlockPickerItem,
    type BlockPickerModal,
    type BlockPickerOption,
    type BlockPickerSlotGroup,
    type BlockPickerSelectDetail,
} from "../BlockPickerModal/BlockPickerModal";
import {
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
    DataSourcePicker,
    type DataSourcePickerSourceBinding,
    type DataSourcePickerSelectDetail,
} from "../DataSourcePicker/DataSourcePicker";
import type { EditorStructureNode } from "../../../runtime";
import type { EditorDataSource } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type StructureTreeAction =
    | "add-child"
    | "add-root"
    | "copy"
    | "delete"
    | "duplicate"
    | "move-after"
    | "move-before"
    | "paste-after"
    | "configure-repeat"
    | "replace"
    | "remove-repeat"
    | "remove-source"
    | "set-source";

export type StructureTreeActionDetail = {
    action: StructureTreeAction;
    editor?: Editor;
    sourceEditor?: Editor;
    entry?: EditorCatalogEntry;
    item?: BlockPickerItem;
    dataSource?: EditorDataSource;
    sourceBinding?: DataSourcePickerSourceBinding;
    slot?: string;
};

export type StructureTreeRenderOptions = {
    scrollSelectedIntoView?: boolean;
    repeatableTargets?: HTMLElement[];
};

export class StructureTree extends HTMLElement {
    private _nodes: EditorStructureNode[] = [];
    private _selectedEditor: Editor | null = null;
    private _catalog: EditorCatalog = [];
    private _dataSources: EditorDataSource[] = [];
    private _insertItems: BlockPickerItem[] = [];
    private _scrollSelectedIntoViewOnRender = false;
    private readonly _repeatableTargets = new WeakSet<HTMLElement>();
    private _pendingPickerAction: { action: "add-child" | "add-root" | "replace"; editor?: Editor } | null = null;
    private _pendingSourceEditor: Editor | null = null;
    private _draggedNode: EditorStructureNode | null = null;
    private _dropRow: HTMLElement | null = null;
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
        this._dataSourcePicker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect as EventListener);
        this._dataSourcePicker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
        this._tree.addEventListener("click", this._onTreeClick);
        this._tree.addEventListener("contextmenu", this._onTreeContextMenu);
    }

    disconnectedCallback(): void {
        this.ownerDocument.removeEventListener("click", this._closeContextMenu);
        this.ownerDocument.removeEventListener("keydown", this._onDocumentKeydown);
        this._blockPicker.removeEventListener(BLOCK_PICKER_SELECT_EVENT, this._onBlockPickerSelect as EventListener);
        this._dataSourcePicker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect as EventListener);
        this._dataSourcePicker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
        this._tree.removeEventListener("click", this._onTreeClick);
        this._tree.removeEventListener("contextmenu", this._onTreeContextMenu);
    }

    setCatalog(catalog: EditorCatalog): void {
        this.catalog = catalog;
    }

    setInsertItems(items: BlockPickerItem[]): void {
        this._insertItems = items.map(item => ({ ...item }));
    }

    setDataSources(sources: EditorDataSource[]): void {
        this._dataSources = sources.map(source => ({
            ...source,
            fields: [...source.fields],
        }));
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
        this._setRepeatableTargets(options.repeatableTargets ?? []);
        this._render();
    }

    private _render(): void {
        const tree = this._tree;
        const scrollContainer = this._scrollContainer;
        const previousScrollTop = scrollContainer.scrollTop;
        tree.replaceChildren();
        this._contextMenu.remove();

        if (this._nodes.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Add block";
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                this._openRootPicker();
            });
            empty.append("No editable elements", button);
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
        button.draggable = true;
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
        button.addEventListener("dragstart", (event) => this._onDragStart(node, event));
        button.addEventListener("dragover", (event) => this._onDragOver(node, row, event));
        button.addEventListener("dragleave", () => this._clearDropRow());
        button.addEventListener("drop", (event) => this._onDrop(node, event));
        button.addEventListener("dragend", () => this._clearDragState());

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
            badges.append(this._renderBadge(value));
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

    private _renderBadge(value: string): HTMLElement {
        const badge = document.createElement("span");
        badge.className = this._badgeClass(value);

        const icon = this._badgeIcon(value);
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

    private _badgeClass(value: string): string {
        return value === "Source" || value === "Repeat" ? "badge data" : "badge";
    }

    private _badgeIcon(value: string): string | null {
        if (value === "Source") return "▦";
        if (value === "Repeat") return "↻";
        return null;
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

        const sourceAction = this._contextMenuButton(this._sourceActionLabel(node), () => {
            this._openSourcePicker(node);
        }, undefined, this._sourceDataSources.length === 0);
        const repeatAction = node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)
            ? this._contextMenuButton("Remove repeat", () => this._emitAction("remove-repeat", node.editor))
            : this._contextMenuButton("Add repeat", () => this._emitAction("configure-repeat", node.editor), undefined, !this._repeatableTargets.has(node.target));

        menu.append(
            this._contextMenuButton("Add child", () => {
                this._pendingPickerAction = { action: "add-child", editor: node.editor };
                this._blockPicker.open(this._childGroups(node), node.label);
            }, undefined, !this._hasEnabledGroup(this._childGroups(node))),
            this._contextMenuButton("Copy", () => this._emitAction("copy", node.editor)),
            this._contextMenuButton("Paste after", () => this._emitAction("paste-after", node.editor)),
            this._contextMenuButton("Duplicate", () => this._emitAction("duplicate", node.editor), undefined, !this._canDuplicate(node)),
            this._contextSeparator(),
            sourceAction,
            repeatAction,
            this._contextSeparator(),
            this._contextMenuButton("Replace", () => {
                this._pendingPickerAction = { action: "replace", editor: node.editor };
                this._blockPicker.open(this._replaceGroups(node), node.label);
            }, undefined, !this._hasEnabledGroup(this._replaceGroups(node))),
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

    private _openSourcePicker(node: EditorStructureNode): void {
        this._pendingSourceEditor = node.editor;
        const picker = this._dataSourcePicker;
        picker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect as EventListener);
        picker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
        picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, this._onDataSourceSelect as EventListener);
        picker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, this._onDataSourceRemove);
        picker.open(this._sourceDataSources, node.label, {
            canRemove: node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source),
        });
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

    private _contextSeparator(): HTMLElement {
        const separator = document.createElement("div");
        separator.className = "context-separator";
        separator.role = "separator";
        return separator;
    }

    private _openRootContextMenu(clientX: number, clientY: number): void {
        this._closeContextMenu();

        const menu = this._contextMenu;
        menu.replaceChildren(
            this._contextMenuButton("Add block", () => this._openRootPicker(), undefined, !this._hasEnabledGroup(this._rootGroups())),
            this._contextMenuButton("Paste", () => this._emitAction("paste-after")),
        );

        this.shadowRoot!.append(menu);
        this._positionContextMenu(menu, clientX, clientY);
    }

    private _openRootPicker(): void {
        this._pendingPickerAction = { action: "add-root" };
        this._blockPicker.open(this._rootGroups(), "Page");
    }

    private _emitAction(
        action: StructureTreeAction,
        editor?: Editor,
        item?: BlockPickerItem,
        slot?: string,
        sourceEditor?: Editor,
        dataSource?: EditorDataSource,
        sourceBinding?: DataSourcePickerSourceBinding,
    ): void {
        this.dispatchEvent(new CustomEvent<StructureTreeActionDetail>("editor-v2:structure-action", {
            bubbles: true,
            composed: true,
            detail: {
                action,
                editor,
                sourceEditor,
                item,
                dataSource,
                sourceBinding,
                entry: item?.kind === "block" ? item.entry : undefined,
                slot,
            },
        }));
    }

    private _rootGroups(): BlockPickerSlotGroup[] {
        const options: BlockPickerOption[] = [
            ...this._catalog.filter(entry => entry.category !== "Runtime").map(entry => ({
                item: {
                    kind: "block" as const,
                    entry,
                },
                entry,
                slotLabel: "Page",
            })),
            ...this._insertItems.filter(item => item.kind !== "media").map(item => ({
                item,
                slotLabel: "Page",
            })),
        ];

        return [{
            label: "Page",
            disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
            options,
        }];
    }

    private _childGroups(node: EditorStructureNode): BlockPickerSlotGroup[] {
        return node.editor.getContentSlots().map(slot => {
            const isFull = this._isSlotFull(node, slot);
            const options = isFull ? [] : this._slotOptions(slot, node);

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
        if (!parent) return this._rootGroups();

        const slot = this._slotForChild(parent, node);
        if (!slot) return [];

        const options = this._slotOptions(slot, parent, node);

        return [{
            slot: slot.slot,
            label: slot.label,
            disabledReason: options.length === 0 ? "No compatible blocks." : undefined,
            options,
        }];
    }

    private _slotOptions(slot: ContentSlot, parent: EditorStructureNode, replaced?: EditorStructureNode): BlockPickerOption[] {
        const blockOptions: BlockPickerOption[] = this._catalog.filter(entry => {
            if (entry.category === "Runtime") return false;
            return slot.accepts.some(accept => this._acceptsEntry(accept, entry));
        }).map(entry => ({
            item: {
                kind: "block" as const,
                entry,
            },
            entry,
            slot: slot.slot,
            slotLabel: slot.label,
        }));

        const externalOptions: BlockPickerOption[] = this._insertItems
            .filter(item => slot.accepts.some(accept => this._acceptsItem(accept, item)))
            .filter(item => this._canFitItem(parent, slot, item, replaced))
            .map(item => ({
                item,
                slot:      slot.slot,
                slotLabel: slot.label,
            }));

        const mediaAccept = this._mediaAcceptForSlot(slot);
        const mediaOptions: BlockPickerOption[] = mediaAccept
            ? [{
                item: {
                    kind:        "media" as const,
                    label:       "Media",
                    description: "Choose a file from the CMS library.",
                    category:    "Media",
                    subCategory: mediaAccept.join(", "),
                    icon:        "M",
                    accept:      mediaAccept,
                },
                slot:      slot.slot,
                slotLabel: slot.label,
            }]
            : [];

        return [
            ...blockOptions.filter(option => this._canFitItem(parent, slot, option.item!, replaced)),
            ...externalOptions,
            ...mediaOptions.filter(option => option.item && this._canFitItem(parent, slot, option.item, replaced)),
        ];
    }

    private _mediaAcceptForSlot(slot: ContentSlot): ("image" | "bitmap" | "svg" | "video" | "audio" | "document")[] | null {
        const explicit = slot.accepts.find(accept => accept.kind === "media");
        if (explicit?.kind === "media") return explicit.accept ?? ["image"];

        if (slot.accepts.some(accept => accept.kind === "component" && accept.tag.toLowerCase() === "img")) {
            return ["image"];
        }

        if (slot.accepts.some(accept => accept.kind === "any-component")) {
            return ["image"];
        }

        return null;
    }

    private _hasEnabledGroup(groups: BlockPickerSlotGroup[]): boolean {
        return groups.some(group => !group.disabledReason && group.options.length > 0);
    }

    private _acceptsEntry(accept: ContentSlotAccept, entry: EditorCatalogEntry): boolean {
        if (accept.kind === "media") return false;
        if (accept.kind === "any-component") return true;
        return accept.tag.toLowerCase() === entry.tag.toLowerCase();
    }

    private _acceptsItem(accept: ContentSlotAccept, item: BlockPickerItem): boolean {
        if (item.kind === "media") return accept.kind === "media";
        if (item.kind === "block") return this._acceptsEntry(accept, item.entry);
        if (accept.kind === "media") return false;
        if (accept.kind === "any-component") return true;
        if (item.kind === "snippet") return accept.tag.toLowerCase() === CMS_SNIPPET_TAG;
        return false;
    }

    private _canFitItem(parent: EditorStructureNode, slot: ContentSlot, item: BlockPickerItem, replaced?: EditorStructureNode): boolean {
        if (typeof slot.max !== "number") return true;

        const replacedCount = replaced && this._slotForChild(parent, replaced) === slot ? 1 : 0;
        return this._slotChildCount(parent, slot) - replacedCount + this._itemRootCount(item) <= slot.max;
    }

    private _itemRootCount(item: BlockPickerItem): number {
        if (item.kind !== "template") return 1;

        const template = document.createElement("template");
        template.innerHTML = item.content;
        const elementCount = template.content.children.length;
        if (elementCount > 0) return elementCount;

        return template.content.textContent?.trim() ? 1 : 0;
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
        this._emitAction(action, editor, event.detail.option.item, event.detail.option.slot);
        this._pendingPickerAction = null;
    };

    private readonly _onDataSourceSelect = (event: CustomEvent<DataSourcePickerSelectDetail>): void => {
        if (!this._pendingSourceEditor) return;
        this._emitAction("set-source", this._pendingSourceEditor, undefined, undefined, undefined, event.detail.source, event.detail.binding);
        this._pendingSourceEditor = null;
    };

    private readonly _onDataSourceRemove = (): void => {
        if (!this._pendingSourceEditor) return;
        this._emitAction("remove-source", this._pendingSourceEditor);
        this._pendingSourceEditor = null;
    };

    private readonly _closeContextMenu = (): void => {
        this._contextMenu.remove();
    };

    private readonly _onDocumentKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this._closeContextMenu();
            return;
        }

        if ((event.key === "Delete" || event.key === "Backspace") && this._selectedEditor && !this._isEditableKeyEvent(event)) {
            event.preventDefault();
            this._emitAction("delete", this._selectedEditor);
            return;
        }

        if (!event.ctrlKey && !event.metaKey) return;
        if (this._isEditableKeyEvent(event)) return;

        const key = event.key.toLowerCase();
        if (key === "c" && this._selectedEditor) {
            event.preventDefault();
            this._emitAction("copy", this._selectedEditor);
        } else if (key === "v") {
            event.preventDefault();
            this._emitAction("paste-after", this._selectedEditor ?? undefined);
        }
    };

    private readonly _onTreeClick = (event: Event): void => {
        if (event.target !== this._tree) return;
        this._openRootPicker();
    };

    private readonly _onTreeContextMenu = (event: Event): void => {
        if (event.target !== this._tree) return;
        event.preventDefault();
        const mouseEvent = event as MouseEvent;
        this._openRootContextMenu(mouseEvent.clientX, mouseEvent.clientY);
    };

    private _onDragStart(node: EditorStructureNode, event: DragEvent): void {
        this._draggedNode = node;
        event.dataTransfer?.setData("text/plain", node.label);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    }

    private _onDragOver(node: EditorStructureNode, row: HTMLElement, event: DragEvent): void {
        if (!this._draggedNode || this._draggedNode === node || this._isDescendantNode(node, this._draggedNode)) return;
        event.preventDefault();
        this._clearDropRow();
        const position = this._dropPosition(row, event);
        row.classList.add(position === "before" ? "drop-before" : "drop-after");
        this._dropRow = row;
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    }

    private _onDrop(node: EditorStructureNode, event: DragEvent): void {
        if (!this._draggedNode || this._draggedNode === node || this._isDescendantNode(node, this._draggedNode)) return;
        event.preventDefault();
        const position = this._dropPosition(event.currentTarget as HTMLElement, event);
        this._emitAction(position === "before" ? "move-before" : "move-after", node.editor, undefined, undefined, this._draggedNode.editor);
        this._clearDragState();
    }

    private _dropPosition(target: HTMLElement, event: DragEvent): "before" | "after" {
        const rect = target.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }

    private _clearDragState(): void {
        this._draggedNode = null;
        this._clearDropRow();
    }

    private _clearDropRow(): void {
        this._dropRow?.classList.remove("drop-before", "drop-after");
        this._dropRow = null;
    }

    private _isDescendantNode(candidate: EditorStructureNode, parent: EditorStructureNode): boolean {
        return parent.children.some(child => child === candidate || this._isDescendantNode(candidate, child));
    }

    private _isEditableKeyEvent(event: Event): boolean {
        return event.composedPath().some(target => {
            if (!(target instanceof Element)) return false;
            return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
        });
    }

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

    private _sourceActionLabel(node: EditorStructureNode): string {
        return node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source) ? "Update source" : "Add source";
    }

    private _setRepeatableTargets(targets: HTMLElement[]): void {
        for (const node of this._flattenNodes(this._nodes)) {
            if (!targets.includes(node.target)) this._repeatableTargets.delete(node.target);
        }
        for (const target of targets) {
            this._repeatableTargets.add(target);
        }
    }

    private _flattenNodes(nodes: EditorStructureNode[]): EditorStructureNode[] {
        return nodes.flatMap(node => [
            node,
            ...this._flattenNodes(node.children),
        ]);
    }

    private get _sourceDataSources(): EditorDataSource[] {
        return this._dataSources.filter(source => (source.method ?? "GET") === "GET");
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

    private get _tree(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".structure-tree")!;
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

    private get _dataSourcePicker(): DataSourcePicker {
        let picker = this.shadowRoot!.querySelector<DataSourcePicker>("cms-editor-v2-data-source-picker");
        if (!picker) {
            picker = new DataSourcePicker();
            this.shadowRoot!.append(picker);
        }
        return picker;
    }
}

if (!customElements.get("cms-editor-v2-structure-tree")) {
    customElements.define("cms-editor-v2-structure-tree", StructureTree);
}
