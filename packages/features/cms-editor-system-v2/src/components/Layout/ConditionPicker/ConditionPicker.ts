import type { CmsSourceState, Editor } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type ConditionPickerSource = {
    editor: Editor;
    label: string;
    sourceName?: string;
};

export type ConditionPickerCondition = {
    sourceEditor: Editor;
    sourceState: CmsSourceState;
};

export type ConditionPickerApplyDetail = {
    conditions: ConditionPickerCondition[];
};

export const CONDITION_PICKER_APPLY_EVENT = "editor-v2:condition-apply";
export const CONDITION_PICKER_REMOVE_EVENT = "editor-v2:condition-remove";

const STATES: CmsSourceState[] = ["loaded", "loading", "empty", "error"];

export class ConditionPicker extends HTMLElement {
    private _sources: ConditionPickerSource[] = [];
    private _selected = new Set<string>();
    private _canRemove = false;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this._onBackdropClick);
        this.applyButton.addEventListener("click", this._apply);
        this.removeButton.addEventListener("click", this._remove);
    }

    connectedCallback(): void {
        this.ownerDocument.addEventListener("keydown", this._onKeydown);
    }

    disconnectedCallback(): void {
        this.ownerDocument.removeEventListener("keydown", this._onKeydown);
    }

    open(options: {
        sources: ConditionPickerSource[];
        selected?: ConditionPickerCondition[];
        contextLabel?: string;
        canRemove?: boolean;
    }): void {
        this._sources = options.sources;
        this._selected = new Set((options.selected ?? []).map(condition => this.key(condition.sourceEditor, condition.sourceState)));
        this._canRemove = options.canRemove === true;
        this.subtitle.textContent = options.contextLabel ? `Conditions for ${options.contextLabel}.` : "Conditions";
        this.backdrop.hidden = false;
        this.render();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private render(): void {
        this.body.replaceChildren();
        if (this._sources.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No source available.";
            this.body.append(empty);
        } else {
            for (const source of this._sources) this.body.append(this.renderSource(source));
        }
        this.applyButton.disabled = this._selected.size === 0;
        this.removeButton.disabled = !this._canRemove;
    }

    private renderSource(source: ConditionPickerSource): HTMLElement {
        const section = document.createElement("section");
        section.className = "source";
        const title = document.createElement("div");
        title.className = "source-title";
        title.textContent = source.label;
        const name = document.createElement("div");
        name.className = "source-name";
        name.textContent = source.sourceName ? `Source: ${source.sourceName}` : "";
        const states = document.createElement("div");
        states.className = "states";
        for (const state of STATES) states.append(this.renderState(source, state));
        section.append(title);
        if (source.sourceName) section.append(name);
        section.append(states);
        return section;
    }

    private renderState(source: ConditionPickerSource, state: CmsSourceState): HTMLElement {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = this._selected.has(this.key(source.editor, state));
        input.addEventListener("change", () => {
            const key = this.key(source.editor, state);
            input.checked ? this._selected.add(key) : this._selected.delete(key);
            this.applyButton.disabled = this._selected.size === 0;
        });
        const text = document.createElement("span");
        text.textContent = state;
        label.append(input, text);
        return label;
    }

    private readonly _apply = (): void => {
        const conditions: ConditionPickerCondition[] = [];
        for (const source of this._sources) {
            for (const state of STATES) {
                if (this._selected.has(this.key(source.editor, state))) {
                    conditions.push({ sourceEditor: source.editor, sourceState: state });
                }
            }
        }
        if (conditions.length === 0) return;
        this.dispatchEvent(new CustomEvent<ConditionPickerApplyDetail>(CONDITION_PICKER_APPLY_EVENT, {
            bubbles: true,
            composed: true,
            detail: { conditions },
        }));
        this.close();
    };

    private readonly _remove = (): void => {
        if (!this._canRemove) return;
        this.dispatchEvent(new CustomEvent(CONDITION_PICKER_REMOVE_EVENT, {
            bubbles: true,
            composed: true,
        }));
        this.close();
    };

    private readonly _onBackdropClick = (event: Event): void => {
        if (event.target === this.backdrop) this.close();
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        if (!this.backdrop.hidden && event.key === "Escape") this.close();
    };

    private key(editor: Editor, state: CmsSourceState): string {
        return `${this._sources.findIndex(source => source.editor === editor)}:${state}`;
    }

    private get backdrop(): HTMLElement {
        return this.shadowRoot!.querySelector(".backdrop")!;
    }

    private get closeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".close")!;
    }

    private get subtitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".subtitle")!;
    }

    private get body(): HTMLElement {
        return this.shadowRoot!.querySelector(".body")!;
    }

    private get applyButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".apply")!;
    }

    private get removeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".remove")!;
    }
}

if (!customElements.get("cms-editor-v2-condition-picker")) {
    customElements.define("cms-editor-v2-condition-picker", ConditionPicker);
}
