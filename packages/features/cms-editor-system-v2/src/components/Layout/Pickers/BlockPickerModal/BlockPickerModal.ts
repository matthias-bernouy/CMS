import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";
import { normalizeBlockPickerOption } from "./blockPickerItems";
import { activeBlockPickerGroup, blockPickerOptionsForSource, firstEnabledBlockPickerGroup } from "./blockPickerState";
import {
    BLOCK_PICKER_SELECT_EVENT,
    type BlockPickerItem,
    type BlockPickerOption,
    type BlockPickerSelectDetail,
    type BlockPickerSlotGroup,
} from "./blockPickerTypes";
import { renderBlockPickerResults } from "./Rendering/blockPickerResults";
import { renderBlockPickerSidebar } from "./Rendering/blockPickerSidebar";
import { renderBlockPickerTabs } from "./Rendering/blockPickerView";
import { type BlockPickerElements, queryBlockPickerElements } from "./Rendering/blockPickerElements";

export * from "./blockPickerTypes";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class BlockPickerModal extends HTMLElement {
    private _groups: BlockPickerSlotGroup[] = [];
    private _activeSlotKey = "";
    private _activeSource: BlockPickerItem["kind"] = "block";
    private _activeCategory = "";
    private _activeOption: BlockPickerOption | null = null;
    private readonly elements: BlockPickerElements;

    constructor() {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.append(template.content.cloneNode(true));
        this.elements = queryBlockPickerElements(shadowRoot);
    }

    connectedCallback(): void {
        this.elements.closeButton.addEventListener("click", this.close);
        this.elements.backdrop.addEventListener("click", this._onBackdropClick);
        this.elements.search.addEventListener("input", this._onSearchInput);
        this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }

    disconnectedCallback(): void {
        this.elements.closeButton.removeEventListener("click", this.close);
        this.elements.backdrop.removeEventListener("click", this._onBackdropClick);
        this.elements.search.removeEventListener("input", this._onSearchInput);
        this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }

    open(groups: BlockPickerSlotGroup[], contextLabel?: string): void {
        this._groups = groups.map((group) => ({
            ...group,
            options: group.options.map((option) => normalizeBlockPickerOption(option)),
        }));
        this._activeSlotKey = firstEnabledBlockPickerGroup(this._groups)?.slot ?? "";
        this._activeSource = "block";
        this._activeCategory = "";
        this._activeOption = null;
        this.elements.subtitle.textContent = contextLabel
            ? `Choose content to add inside ${contextLabel}.`
            : "Choose content to add.";
        this.elements.search.value = "";
        this.elements.backdrop.hidden = false;
        this._render();
        this.elements.search.focus();
    }

    readonly close = (): void => {
        this.elements.backdrop.hidden = true;
    };

    private readonly _onSearchInput = (): void => {
        this._activeOption = null;
        this._renderEntries();
    };

    private _render(): void {
        renderBlockPickerTabs(this.elements.tabs, this._groups, this._activeSlotKey, (slotKey) => {
            this._activeSlotKey = slotKey;
            this._activeCategory = "";
            this._activeOption = null;
            this._render();
        });
        this._renderSidebar();
        this._renderEntries();
    }

    private _renderEntries(): void {
        this._activeOption = renderBlockPickerResults({
            activeCategory: this._activeCategory,
            activeOption: this._activeOption,
            activeSource: this._activeSource,
            details: this.elements.details,
            group: this._activeGroup(),
            onActivate: (option) => {
                this._activeOption = option;
                this._renderEntries();
            },
            onSelect: (option) => this._selectOption(option),
            query: this.elements.search.value.trim().toLowerCase(),
            results: this.elements.results,
        });
    }

    private _renderSidebar(): void {
        renderBlockPickerSidebar({
            activeCategory: this._activeCategory,
            activeSource: this._activeSource,
            categories: this.elements.categories,
            group: this._activeGroup(),
            onCategory: (category) => {
                this._activeCategory = category;
                this._renderSidebar();
                this._renderEntries();
            },
            onSingleMedia: () => this._selectSingleSourceOption("media"),
            onSource: (source) => {
                this._activeSource = source;
                this._activeCategory = "";
                if (source !== "block") {
                    this._activeOption = null;
                }
                this._renderSidebar();
                this._renderEntries();
            },
            sources: this.elements.sources,
        });
    }

    private _selectOption(option: BlockPickerOption): void {
        this.dispatchEvent(
            new CustomEvent<BlockPickerSelectDetail>(BLOCK_PICKER_SELECT_EVENT, {
                bubbles: true,
                composed: true,
                detail: { option },
            }),
        );
        this.close();
    }

    private _selectSingleSourceOption(source: BlockPickerItem["kind"]): boolean {
        const options = blockPickerOptionsForSource(this._activeGroup(), source);
        if (options.length !== 1) {
            return false;
        }
        this._selectOption(options[0]!);
        return true;
    }

    private _activeGroup(): BlockPickerSlotGroup | undefined {
        return activeBlockPickerGroup(this._groups, this._activeSlotKey);
    }

    private readonly _onBackdropClick = (event: MouseEvent): void => {
        if (event.target === this.elements.backdrop) {
            this.close();
        }
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.close();
        }
    };
}

if (!customElements.get("cms-editor-v2-block-picker-modal")) {
    customElements.define("cms-editor-v2-block-picker-modal", BlockPickerModal);
}
