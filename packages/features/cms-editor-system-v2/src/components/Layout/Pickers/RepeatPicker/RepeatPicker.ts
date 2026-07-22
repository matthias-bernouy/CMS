import type { DataScope } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";
import { defaultRepeatAlias, repeatArrayOptions, visibleRepeatOptions, type RepeatOption } from "./repeatOptions";
import { renderRepeatBinding, renderRepeatDetails } from "./repeatPickerDetails";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type RepeatPickerSelectDetail = {
    path: string;
    alias: string;
};

export const REPEAT_PICKER_SELECT_EVENT = "editor-v2:repeat-select";

export class RepeatPicker extends HTMLElement {
    private _options: RepeatOption[] = [];
    private _activeOption: RepeatOption | null = null;

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

    open(scopes: DataScope[], contextLabel?: string): void {
        this._options = repeatArrayOptions(scopes);
        this._activeOption = null;
        this.subtitle.textContent = contextLabel
            ? `Choose an array to repeat ${contextLabel}.`
            : "Choose an array to repeat.";
        this.search.value = "";
        this.backdrop.hidden = false;
        this._render();
        this.search.focus();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private _render(): void {
        this._renderOptions();
        renderRepeatDetails(this.details, this._activeOption);
        renderRepeatBinding(this.binding, this._activeOption, (option, alias) => this._select(option, alias));
    }

    private _renderOptions(): void {
        this.arrays.replaceChildren();
        const options = this._visibleOptions();

        if (options.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No array fields available.";
            this.arrays.append(empty);
            this._activeOption = null;
            return;
        }

        if (!this._activeOption || !options.includes(this._activeOption)) {
            this._activeOption = options[0] ?? null;
        }

        for (const option of options) {
            const button = document.createElement("button");
            button.className = "array";
            button.type = "button";
            button.ariaSelected = String(option === this._activeOption);

            const name = document.createElement("span");
            name.className = "name";
            name.textContent = option.path;

            const scope = document.createElement("span");
            scope.className = "scope";
            scope.textContent = option.scopeLabel;

            button.append(name, scope);
            button.addEventListener("click", () => {
                this._activeOption = option;
                this._render();
            });
            button.addEventListener("dblclick", () => this._select(option));
            this.arrays.append(button);
        }
    }

    private _select(option: RepeatOption, alias = defaultRepeatAlias(option.path)): void {
        const cleanAlias = alias.trim();
        if (!cleanAlias) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent<RepeatPickerSelectDetail>(REPEAT_PICKER_SELECT_EVENT, {
                bubbles: true,
                composed: true,
                detail: {
                    path: option.path,
                    alias: cleanAlias,
                },
            }),
        );
        this.close();
    }

    private _visibleOptions(): RepeatOption[] {
        return visibleRepeatOptions(this._options, this.search.value);
    }

    private readonly _onBackdropClick = (event: Event): void => {
        if (event.target === this.backdrop) {
            this.close();
        }
    };

    private readonly _onSearchInput = (): void => {
        this._activeOption = null;
        this._render();
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (!this.backdrop.hidden && event.key === "Escape") {
            this.close();
        }
    };

    private get backdrop(): HTMLElement {
        return this.shadowRoot!.querySelector(".backdrop")!;
    }

    private get closeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".close")!;
    }

    private get subtitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".subtitle")!;
    }

    private get search(): HTMLInputElement {
        return this.shadowRoot!.querySelector(".search")!;
    }

    private get arrays(): HTMLElement {
        return this.shadowRoot!.querySelector(".arrays")!;
    }

    private get details(): HTMLElement {
        return this.shadowRoot!.querySelector(".details")!;
    }

    private get binding(): HTMLElement {
        return this.shadowRoot!.querySelector(".binding")!;
    }
}

if (!customElements.get("cms-editor-v2-repeat-picker")) {
    customElements.define("cms-editor-v2-repeat-picker", RepeatPicker);
}
