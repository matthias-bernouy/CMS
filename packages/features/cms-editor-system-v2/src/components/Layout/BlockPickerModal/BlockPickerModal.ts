import type { EditorCatalogEntry } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type BlockPickerOption = {
    entry: EditorCatalogEntry;
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

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this._onBackdropClick);
        this.search.addEventListener("input", this._renderEntries);
        this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }

    disconnectedCallback(): void {
        this.closeButton.removeEventListener("click", this.close);
        this.backdrop.removeEventListener("click", this._onBackdropClick);
        this.search.removeEventListener("input", this._renderEntries);
        this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }

    open(groups: BlockPickerSlotGroup[], contextLabel?: string): void {
        this._groups = groups.map(group => ({
            ...group,
            options: [...group.options],
        }));
        this._activeSlotKey = this._firstEnabledGroup()?.slot ?? "";
        this.subtitle.textContent = contextLabel ? `Choose a block to add inside ${contextLabel}.` : "Choose a block to add.";
        this.search.value = "";
        this.backdrop.hidden = false;
        this._renderTabs();
        this._renderEntries();
        this.search.focus();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private readonly _renderEntries = (): void => {
        const query = this.search.value.trim().toLowerCase();
        const group = this._activeGroup();
        const options = group?.options.filter(option => this._matches(option, query)) ?? [];
        this.content.replaceChildren();

        if (group?.disabledReason) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = group.disabledReason;
            this.content.append(empty);
            return;
        }

        if (options.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No blocks available";
            this.content.append(empty);
            return;
        }

        for (const [groupName, groupOptions] of this._groupOptions(options)) {
            const group = document.createElement("section");
            group.className = "group";

            const title = document.createElement("div");
            title.className = "group-title";
            title.textContent = groupName;

            const items = document.createElement("div");
            items.className = "items";

            for (const option of groupOptions) {
                items.append(this._renderOption(option));
            }

            group.append(title, items);
            this.content.append(group);
        }
    };

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
                this._renderTabs();
                this._renderEntries();
            });
            this.tabs.append(button);
        }
    }

    private _renderOption(option: BlockPickerOption): HTMLElement {
        const button = document.createElement("button");
        button.className = "block";
        button.type = "button";
        button.addEventListener("click", () => {
            this.dispatchEvent(new CustomEvent<BlockPickerSelectDetail>(BLOCK_PICKER_SELECT_EVENT, {
                bubbles: true,
                composed: true,
                detail: { option },
            }));
            this.close();
        });

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = this._iconText(option.entry);

        const body = document.createElement("span");

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = option.entry.label;

        const description = document.createElement("span");
        description.className = "description";
        description.textContent = option.entry.description ?? option.entry.tag;

        body.append(name, description);
        button.append(icon, body);

        return button;
    }

    private _groupOptions(options: BlockPickerOption[]): [string, BlockPickerOption[]][] {
        const groups = new Map<string, BlockPickerOption[]>();

        for (const option of options) {
            const category = option.entry.category ?? "Blocks";
            const label = option.entry.subCategory ? `${category} / ${option.entry.subCategory}` : category;
            groups.set(label, [...groups.get(label) ?? [], option]);
        }

        return [...groups.entries()];
    }

    private _matches(option: BlockPickerOption, query: string): boolean {
        if (!query) return true;
        const entry = option.entry;
        return [
            entry.label,
            entry.description,
            entry.category,
            entry.subCategory,
            entry.tag,
            option.slotLabel,
        ].some(value => value?.toLowerCase().includes(query));
    }

    private _iconText(entry: EditorCatalogEntry): string {
        return (entry.icon ?? entry.label).slice(0, 1).toUpperCase();
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
        return this.shadowRoot!.querySelector(".tabs")!;
    }

    private get subtitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".subtitle")!;
    }

    private get content(): HTMLElement {
        return this.shadowRoot!.querySelector(".content")!;
    }
}

if (!customElements.get("cms-editor-v2-block-picker-modal")) {
    customElements.define("cms-editor-v2-block-picker-modal", BlockPickerModal);
}
