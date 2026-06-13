import type { EditorCatalogEntry } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type BlockPickerItem =
    | {
        kind: "block";
        entry: EditorCatalogEntry;
    }
    | {
        kind: "template";
        id: string;
        label: string;
        description?: string;
        category?: string;
        subCategory?: string;
        icon?: string;
        content: string;
    }
    | {
        kind: "snippet";
        id: string;
        identifier: string;
        label: string;
        description?: string;
        category?: string;
        subCategory?: string;
        icon?: string;
        content: string;
    };

export type BlockPickerOption = {
    kind?: BlockPickerItem["kind"];
    item?: BlockPickerItem;
    entry?: EditorCatalogEntry;
    slot?: string;
    slotLabel: string;
};

export type BlockPickerSlotGroup = {
    slot?: string;
    label: string;
    disabledReason?: string;
    options: BlockPickerOption[];
};

export type BlockPickerSelectDetail = {
    option: BlockPickerOption;
};

export const BLOCK_PICKER_SELECT_EVENT = "editor-v2:block-picker-select";

export class BlockPickerModal extends HTMLElement {
    private _groups: BlockPickerSlotGroup[] = [];
    private _activeSlotKey = "";
    private _activeSource: BlockPickerItem["kind"] = "block";
    private _activeCategory = "";
    private _activeOption: BlockPickerOption | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this._onBackdropClick);
        this.search.addEventListener("input", this._onSearchInput);
        this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }

    disconnectedCallback(): void {
        this.closeButton.removeEventListener("click", this.close);
        this.backdrop.removeEventListener("click", this._onBackdropClick);
        this.search.removeEventListener("input", this._onSearchInput);
        this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }

    open(groups: BlockPickerSlotGroup[], contextLabel?: string): void {
        this._groups = groups.map(group => ({
            ...group,
            options: group.options.map(option => this._normalizeOption(option)),
        }));
        this._activeSlotKey = this._firstEnabledGroup()?.slot ?? "";
        this._activeSource = "block";
        this._activeCategory = "";
        this._activeOption = null;
        this.subtitle.textContent = contextLabel ? `Choose content to add inside ${contextLabel}.` : "Choose content to add.";
        this.search.value = "";
        this.backdrop.hidden = false;
        this._render();
        this.search.focus();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private readonly _onSearchInput = (): void => {
        this._activeOption = null;
        this._renderEntries();
    };

    private readonly _render = (): void => {
        this._renderTabs();
        this._renderSidebar();
        this._renderEntries();
    };

    private _renderEntries(): void {
        const query = this.search.value.trim().toLowerCase();
        const group = this._activeGroup();
        const options = group?.options.filter(option => this._isVisibleOption(option, query)) ?? [];
        this.results.replaceChildren();

        if (group?.disabledReason) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = group.disabledReason;
            this.results.append(empty);
            this._activeOption = null;
            this._renderDetails();
            return;
        }

        if (options.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No content available";
            this.results.append(empty);
            this._activeOption = null;
            this._renderDetails();
            return;
        }

        if (!this._activeOption || !options.includes(this._activeOption)) {
            this._activeOption = options[0] ?? null;
        }

        for (const option of options) {
            this.results.append(this._renderOption(option));
        }

        this._renderDetails();
    }

    private _renderSidebar(): void {
        this.sources.replaceChildren();
        this.categories.replaceChildren();

        this.sources.append(
            this._filterButton("Blocks", this._activeSource === "block", () => {
                this._activeSource = "block";
                this._activeCategory = "";
                this._renderSidebar();
                this._renderEntries();
            }, this._sourceCount("block")),
            this._filterButton("Templates", this._activeSource === "template", () => {
                this._activeSource = "template";
                this._activeCategory = "";
                this._activeOption = null;
                this._renderSidebar();
                this._renderEntries();
            }, this._sourceCount("template"), this._sourceCount("template") === 0),
            this._filterButton("Snippets", this._activeSource === "snippet", () => {
                this._activeSource = "snippet";
                this._activeCategory = "";
                this._activeOption = null;
                this._renderSidebar();
                this._renderEntries();
            }, this._sourceCount("snippet"), this._sourceCount("snippet") === 0),
        );

        const categories = this._categories();
        this.categories.append(this._filterButton("All", this._activeCategory === "", () => {
            this._activeCategory = "";
            this._renderSidebar();
            this._renderEntries();
        }, this._sourceCount(this._activeSource)));

        for (const category of categories) {
            this.categories.append(this._filterButton(category, this._activeCategory === category, () => {
                this._activeCategory = category;
                this._renderSidebar();
                this._renderEntries();
            }, this._categoryCount(category)));
        }
    }

    private _filterButton(label: string, active: boolean, onClick: () => void, count: number, disabled = false): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = "filter";
        button.type = "button";
        button.disabled = disabled;
        button.ariaPressed = String(active);
        button.addEventListener("click", () => {
            if (button.disabled) return;
            onClick();
        });

        const text = document.createElement("span");
        text.textContent = label;

        const badge = document.createElement("span");
        badge.className = "count";
        badge.textContent = String(count);

        button.append(text, badge);
        return button;
    }

    private _renderDetails(): void {
        this.details.replaceChildren();
        const option = this._activeOption;
        if (!option) {
            const empty = document.createElement("div");
            empty.className = "details-empty";
            empty.textContent = "Select content to see details.";
            this.details.append(empty);
            return;
        }

        const item = this._optionItem(option);
        const eyebrow = document.createElement("div");
        eyebrow.className = "details-eyebrow";
        eyebrow.textContent = this._sourceLabel(item.kind);

        const title = document.createElement("h3");
        title.textContent = this._itemLabel(item);

        const description = document.createElement("p");
        description.textContent = this._itemDescription(item);

        const preview = document.createElement("div");
        preview.className = "preview";

        const previewIcon = document.createElement("span");
        previewIcon.className = "preview-icon";
        previewIcon.textContent = this._iconText(item);

        preview.append(previewIcon);

        const meta = document.createElement("dl");
        meta.append(
            this._metaRow("Source", this._sourceLabel(item.kind)),
            this._metaRow("Handle", this._itemHandle(item)),
            this._metaRow("Slot", option.slotLabel),
            this._metaRow("Category", this._categoryLabel(option)),
        );

        const insert = document.createElement("button");
        insert.className = "insert";
        insert.type = "button";
        insert.textContent = "Insert";
        insert.addEventListener("click", () => this._selectOption(option));

        this.details.append(preview, eyebrow, title, description, meta, insert);
    }

    private _metaRow(label: string, value: string): HTMLElement {
        const wrapper = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = label;
        detail.textContent = value;
        wrapper.append(term, detail);
        return wrapper;
    }

    private _renderTabs(): void {
        this.tabs.replaceChildren();

        for (const group of this._groups) {
            const button = document.createElement("button");
            const slotKey = group.slot ?? "";
            button.className = "tab";
            button.type = "button";
            button.role = "tab";
            button.textContent = group.label;
            button.disabled = Boolean(group.disabledReason);
            button.ariaSelected = String(slotKey === this._activeSlotKey);
            if (group.disabledReason) button.title = group.disabledReason;
            button.addEventListener("click", () => {
                if (button.disabled) return;
                this._activeSlotKey = slotKey;
                this._activeCategory = "";
                this._activeOption = null;
                this._render();
            });
            this.tabs.append(button);
        }
    }

    private _renderOption(option: BlockPickerOption): HTMLElement {
        const button = document.createElement("button");
        button.className = "block";
        button.type = "button";
        button.ariaSelected = String(option === this._activeOption);
        button.addEventListener("click", () => {
            this._activeOption = option;
            this._renderEntries();
        });
        button.addEventListener("dblclick", () => this._selectOption(option));

        const item = this._optionItem(option);
        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = this._iconText(item);

        const body = document.createElement("span");

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = this._itemLabel(item);

        const description = document.createElement("span");
        description.className = "description";
        description.textContent = this._itemDescription(item);

        const category = document.createElement("span");
        category.className = "category";
        category.textContent = this._categoryLabel(option);

        body.append(name, description, category);
        button.append(icon, body);

        return button;
    }

    private _selectOption(option: BlockPickerOption): void {
        this.dispatchEvent(new CustomEvent<BlockPickerSelectDetail>(BLOCK_PICKER_SELECT_EVENT, {
            bubbles: true,
            composed: true,
            detail: { option },
        }));
        this.close();
    }

    private _isVisibleOption(option: BlockPickerOption, query: string): boolean {
        const item = this._optionItem(option);
        if (item.kind !== this._activeSource) return false;
        if (this._activeCategory && this._categoryLabel(option) !== this._activeCategory) return false;
        return this._matches(option, query);
    }

    private _sourceCount(source: BlockPickerItem["kind"]): number {
        return this._activeGroup()?.options.filter(option => this._optionItem(option).kind === source).length ?? 0;
    }

    private _categoryCount(category: string): number {
        return this._activeGroup()?.options.filter(option => this._optionItem(option).kind === this._activeSource && this._categoryLabel(option) === category).length ?? 0;
    }

    private _categories(): string[] {
        const categories = new Set<string>();
        for (const option of this._activeGroup()?.options ?? []) {
            if (this._optionItem(option).kind !== this._activeSource) continue;
            categories.add(this._categoryLabel(option));
        }

        return [...categories].sort((a, b) => a.localeCompare(b));
    }

    private _matches(option: BlockPickerOption, query: string): boolean {
        if (!query) return true;
        const item = this._optionItem(option);
        return [
            this._itemLabel(item),
            this._itemDescription(item),
            this._itemCategory(item),
            this._itemSubCategory(item),
            this._itemHandle(item),
            option.slotLabel,
        ].some(value => value?.toLowerCase().includes(query));
    }

    private _iconText(item: BlockPickerItem): string {
        return (this._itemIcon(item) ?? this._itemLabel(item)).slice(0, 1).toUpperCase();
    }

    private _categoryLabel(option: BlockPickerOption): string {
        const item = this._optionItem(option);
        const category = this._itemCategory(item) ?? this._sourceLabel(item.kind);
        const subCategory = this._itemSubCategory(item);
        return subCategory ? `${category} / ${subCategory}` : category;
    }

    private _normalizeOption(option: BlockPickerOption): BlockPickerOption {
        if (option.item) {
            return {
                ...option,
                kind: option.item.kind,
            };
        }

        if (!option.entry) {
            throw new Error("Block picker option requires either item or entry.");
        }

        return {
            ...option,
            kind: "block",
            item: {
                kind: "block",
                entry: option.entry,
            },
        };
    }

    private _optionItem(option: BlockPickerOption): BlockPickerItem {
        if (option.item) return option.item;
        if (option.entry) {
            return {
                kind: "block",
                entry: option.entry,
            };
        }
        throw new Error("Block picker option requires either item or entry.");
    }

    private _sourceLabel(kind: BlockPickerItem["kind"]): string {
        if (kind === "template") return "Template";
        if (kind === "snippet") return "Snippet";
        return "Block";
    }

    private _itemLabel(item: BlockPickerItem): string {
        return item.kind === "block" ? item.entry.label : item.label;
    }

    private _itemDescription(item: BlockPickerItem): string {
        if (item.kind === "block") return item.entry.description ?? item.entry.tag;
        return item.description ?? this._itemHandle(item);
    }

    private _itemCategory(item: BlockPickerItem): string | undefined {
        return item.kind === "block" ? item.entry.category : item.category;
    }

    private _itemSubCategory(item: BlockPickerItem): string | undefined {
        return item.kind === "block" ? item.entry.subCategory : item.subCategory;
    }

    private _itemIcon(item: BlockPickerItem): string | undefined {
        return item.kind === "block" ? item.entry.icon : item.icon;
    }

    private _itemHandle(item: BlockPickerItem): string {
        if (item.kind === "block") return item.entry.tag;
        if (item.kind === "snippet") return item.identifier;
        return item.id;
    }

    private _activeGroup(): BlockPickerSlotGroup | undefined {
        return this._groups.find(group => (group.slot ?? "") === this._activeSlotKey) ?? this._groups[0];
    }

    private _firstEnabledGroup(): BlockPickerSlotGroup | undefined {
        return this._groups.find(group => !group.disabledReason) ?? this._groups[0];
    }

    private readonly _onBackdropClick = (event: MouseEvent): void => {
        if (event.target === this.backdrop) this.close();
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") this.close();
    };

    private get backdrop(): HTMLElement {
        return this.shadowRoot!.querySelector(".backdrop")!;
    }

    private get closeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".close")!;
    }

    private get search(): HTMLInputElement {
        return this.shadowRoot!.querySelector(".search")!;
    }

    private get tabs(): HTMLElement {
        return this.shadowRoot!.querySelector(".slot-tabs")!;
    }

    private get subtitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".subtitle")!;
    }

    private get sources(): HTMLElement {
        return this.shadowRoot!.querySelector(".sources")!;
    }

    private get categories(): HTMLElement {
        return this.shadowRoot!.querySelector(".categories")!;
    }

    private get results(): HTMLElement {
        return this.shadowRoot!.querySelector(".results")!;
    }

    private get details(): HTMLElement {
        return this.shadowRoot!.querySelector(".details")!;
    }
}

if (!customElements.get("cms-editor-v2-block-picker-modal")) {
    customElements.define("cms-editor-v2-block-picker-modal", BlockPickerModal);
}
