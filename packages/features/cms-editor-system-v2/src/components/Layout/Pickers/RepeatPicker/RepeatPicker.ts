import type { DataScope } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";
import { defaultRepeatAlias, repeatArrayOptions, visibleRepeatOptions, type RepeatOption } from "./repeatOptions";
import { renderRepeatBinding, renderRepeatDetails, renderRepeatOptions } from "./repeatPickerDetails";
import { renderRepeatRangeBinding, renderRepeatRangeDetails } from "./repeatRangePicker";

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
    private _mode: "array" | "range" = "array";

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this._onBackdropClick);
        this.search.addEventListener("input", this._onSearchInput);
        this.modeButtons.forEach((button) => button.addEventListener("click", this._onModeClick));
        this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }

    disconnectedCallback(): void {
        this.closeButton.removeEventListener("click", this.close);
        this.backdrop.removeEventListener("click", this._onBackdropClick);
        this.search.removeEventListener("input", this._onSearchInput);
        this.modeButtons.forEach((button) => button.removeEventListener("click", this._onModeClick));
        this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }

    open(scopes: DataScope[], contextLabel?: string): void {
        this._options = repeatArrayOptions(scopes);
        this._activeOption = null;
        this._mode = this._options.length > 0 ? "array" : "range";
        this.subtitle.textContent = contextLabel
            ? `Choose how to repeat ${contextLabel}.`
            : "Choose how to repeat this element.";
        this.search.value = "";
        this.backdrop.hidden = false;
        this._render();
        (this._mode === "array" ? this.search : this.binding.querySelector<HTMLInputElement>(".count"))?.focus();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private _render(): void {
        this.shadowRoot!.querySelector<HTMLElement>(".body")!.dataset.mode = this._mode;
        this.search.hidden = this._mode === "range";
        for (const button of this.modeButtons) {
            button.ariaPressed = String(button.dataset.mode === this._mode);
        }
        if (this._mode === "range") {
            this.arrays.replaceChildren();
            renderRepeatRangeDetails(this.details);
            renderRepeatRangeBinding(this.binding, (path, alias) => this._selectPath(path, alias));
            return;
        }
        this._renderOptions();
        renderRepeatDetails(this.details, this._activeOption);
        renderRepeatBinding(this.binding, this._activeOption, (option, alias) => this._selectPath(option.path, alias));
    }

    private _renderOptions(): void {
        const options = visibleRepeatOptions(this._options, this.search.value);
        if (!this._activeOption || !options.includes(this._activeOption)) {
            this._activeOption = options[0] ?? null;
        }
        renderRepeatOptions(
            this.arrays,
            options,
            this._activeOption,
            (option) => {
                this._activeOption = option;
                this._render();
            },
            (option) => this._selectPath(option.path, defaultRepeatAlias(option.path)),
        );
    }

    private _selectPath(path: string, alias: string): void {
        const cleanAlias = alias.trim();
        if (!cleanAlias) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent<RepeatPickerSelectDetail>(REPEAT_PICKER_SELECT_EVENT, {
                bubbles: true,
                composed: true,
                detail: {
                    path,
                    alias: cleanAlias,
                },
            }),
        );
        this.close();
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

    private readonly _onModeClick = (event: Event): void => {
        const mode = (event.currentTarget as HTMLButtonElement).dataset.mode;
        if (mode !== "array" && mode !== "range") {
            return;
        }
        this._mode = mode;
        this._render();
        (mode === "array" ? this.search : this.binding.querySelector<HTMLInputElement>(".count"))?.focus();
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

    private get modeButtons(): HTMLButtonElement[] {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>(".mode"));
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
