import type { DataField, DataScope } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import {
    defaultRepeatAlias,
    repeatArrayOptions,
    visibleRepeatOptions,
    type RepeatOption,
} from "./repeatOptions";

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
        this.subtitle.textContent = contextLabel ? `Choose an array to repeat ${contextLabel}.` : "Choose an array to repeat.";
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
        this._renderDetails();
        this._renderBinding();
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

    private _renderDetails(): void {
        this.details.replaceChildren();

        if (!this._activeOption) {
            const empty = document.createElement("div");
            empty.className = "details-empty";
            empty.textContent = "Select an array field to inspect item fields.";
            this.details.append(empty);
            return;
        }

        const option = this._activeOption;
        const heading = document.createElement("div");
        heading.className = "details-eyebrow";
        heading.textContent = "Response fields";

        this.details.append(heading, this._renderFields(option.fields));
    }

    private _renderBinding(): void {
        this.binding.replaceChildren();

        if (!this._activeOption) {
            const empty = document.createElement("div");
            empty.className = "details-empty";
            empty.textContent = "Select an array field to configure repeat.";
            this.binding.append(empty);
            return;
        }

        const option = this._activeOption;
        const heading = document.createElement("div");
        heading.className = "details-eyebrow";
        heading.textContent = "Binding";

        const path = document.createElement("div");
        path.className = "repeat-path";
        const pathLabel = document.createElement("span");
        pathLabel.textContent = "Array";
        const pathValue = document.createElement("strong");
        pathValue.textContent = option.path;
        path.append(pathLabel, pathValue);

        const config = document.createElement("section");
        config.className = "binding-config";
        const label = document.createElement("label");
        label.textContent = "Alias";
        const alias = document.createElement("input");
        alias.className = "alias";
        alias.value = defaultRepeatAlias(option.path);
        label.append(alias);
        config.append(label);

        const insert = document.createElement("button");
        insert.className = "insert";
        insert.type = "button";
        insert.textContent = "Use repeat";
        insert.addEventListener("click", () => this._select(option, alias.value));

        const scroll = document.createElement("div");
        scroll.className = "binding-scroll";
        scroll.append(heading, path, config);
        const footer = document.createElement("footer");
        footer.className = "binding-footer";
        footer.append(insert);

        this.binding.append(scroll, footer);
    }

    private _renderFields(fields: DataField[]): HTMLElement {
        const list = document.createElement("ul");
        list.className = "fields";

        for (const field of fields) list.append(this._renderField(field, 0));

        if (list.children.length === 0) {
            const empty = document.createElement("p");
            empty.className = "details-empty";
            empty.textContent = "No item fields declared.";
            return empty;
        }

        return list;
    }

    private _renderField(field: DataField, depth: number): HTMLElement {
        const item = document.createElement("li");
        item.className = "field";
        item.style.setProperty("--field-depth", String(depth));

        const path = document.createElement("span");
        path.className = "field-path";
        path.textContent = field.path;
        const type = document.createElement("span");
        type.className = "field-type";
        type.textContent = field.type ?? "unknown";
        item.append(path, type);

        if (field.children?.length) {
            const children = document.createElement("ul");
            children.className = "field-children";
            for (const child of field.children) children.append(this._renderField(child, depth + 1));
            item.append(children);
        }

        return item;
    }

    private _select(option: RepeatOption, alias = defaultRepeatAlias(option.path)): void {
        const cleanAlias = alias.trim();
        if (!cleanAlias) return;

        this.dispatchEvent(new CustomEvent<RepeatPickerSelectDetail>(REPEAT_PICKER_SELECT_EVENT, {
            bubbles: true,
            composed: true,
            detail: {
                path: option.path,
                alias: cleanAlias,
            },
        }));
        this.close();
    }

    private _visibleOptions(): RepeatOption[] {
        return visibleRepeatOptions(this._options, this.search.value);
    }

    private readonly _onBackdropClick = (event: Event): void => {
        if (event.target === this.backdrop) this.close();
    };

    private readonly _onSearchInput = (): void => {
        this._activeOption = null;
        this._render();
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (!this.backdrop.hidden && event.key === "Escape") this.close();
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
