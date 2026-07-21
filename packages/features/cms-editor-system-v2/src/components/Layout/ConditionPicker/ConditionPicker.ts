import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { renderAdvancedMode } from "./advancedMode";
import { defaultFieldDraft, fieldExpression, renderFieldMode } from "./fieldMode";
import { renderSourceStateMode, selectedSourceConditions, sourceStateKey } from "./sourceStateMode";
import type {
    ConditionFieldOption,
    ConditionPickerApplyDetail,
    ConditionPickerCondition,
    ConditionPickerMode,
    ConditionPickerSource,
    FieldConditionDraft,
} from "./types";

export type {
    ConditionFieldOption,
    ConditionPickerApplyDetail,
    ConditionPickerCondition,
    ConditionPickerSource,
} from "./types";

export const CONDITION_PICKER_APPLY_EVENT = "editor-v2:condition-apply";
export const CONDITION_PICKER_REMOVE_EVENT = "editor-v2:condition-remove";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class ConditionPicker extends HTMLElement {
    private _mode: ConditionPickerMode = "source";
    private _sources: ConditionPickerSource[] = [];
    private _fields: ConditionFieldOption[] = [];
    private _selected = new Set<string>();
    private _fieldDraft: FieldConditionDraft = defaultFieldDraft([]);
    private _advancedExpression = "";
    private _canRemove = false;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
        this.closeButton.addEventListener("click", this.close);
        this.backdrop.addEventListener("click", this.onBackdropClick);
        this.applyButton.addEventListener("click", this.apply);
        this.removeButton.addEventListener("click", this.removeCondition);
    }

    connectedCallback(): void {
        this.ownerDocument.addEventListener("keydown", this.onKeydown);
    }
    disconnectedCallback(): void {
        this.ownerDocument.removeEventListener("keydown", this.onKeydown);
    }

    open(options: {
        sources: ConditionPickerSource[];
        selected?: ConditionPickerCondition[];
        fields?: ConditionFieldOption[];
        expression?: string;
        contextLabel?: string;
        canRemove?: boolean;
    }): void {
        this._sources = options.sources;
        this._fields = options.fields ?? [];
        this._selected = new Set(
            (options.selected ?? []).map((condition) =>
                sourceStateKey(this._sources, condition.sourceEditor, condition.sourceState),
            ),
        );
        this._fieldDraft = defaultFieldDraft(this._fields);
        this._advancedExpression = options.expression ?? "";
        this._mode = this._selected.size > 0 ? "source" : this._advancedExpression ? "advanced" : "source";
        this._canRemove = options.canRemove === true;
        this.subtitle.textContent = options.contextLabel ? `Conditions for ${options.contextLabel}.` : "Conditions";
        this.backdrop.hidden = false;
        this.render();
    }

    readonly close = (): void => {
        this.backdrop.hidden = true;
    };

    private render(): void {
        this.body.replaceChildren(this.renderModes(), this.renderPanel(), this.renderSummary());
        this.syncActions();
    }

    private renderModes(): HTMLElement {
        const group = document.createElement("div");
        group.className = "modes";
        group.append(
            this.modeButton("source", "Source state"),
            this.modeButton("field", "Data field"),
            this.modeButton("advanced", "Advanced"),
        );
        return group;
    }

    private modeButton(mode: ConditionPickerMode, label: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mode";
        button.textContent = label;
        button.setAttribute("aria-pressed", String(this._mode === mode));
        button.addEventListener("click", () => {
            this._mode = mode;
            this.render();
        });
        return button;
    }

    private renderPanel(): HTMLElement {
        if (this._mode === "field") {
            return renderFieldMode(this._fields, this._fieldDraft, (render) =>
                render ? this.render() : this.syncSummary(),
            );
        }
        if (this._mode === "advanced") {
            return renderAdvancedMode(this._advancedExpression, (value) => {
                this._advancedExpression = value;
                this.syncSummary();
            });
        }
        return renderSourceStateMode({
            sources: this._sources,
            selected: this._selected,
            onChange: () => this.syncSummary(),
        });
    }

    private renderSummary(): HTMLElement {
        const summary = document.createElement("div");
        summary.className = "summary";
        summary.append(this.summaryLabel(), this.summaryCode());
        return summary;
    }

    private summaryLabel(): HTMLElement {
        const label = document.createElement("span");
        label.textContent = "Expression";
        return label;
    }

    private summaryCode(): HTMLElement {
        const code = document.createElement("code");
        code.textContent = this.currentExpression() || "No condition selected.";
        return code;
    }

    private syncSummary(): void {
        this.summary.replaceChildren(this.summaryLabel(), this.summaryCode());
        this.syncActions();
    }

    private syncActions(): void {
        this.applyButton.disabled = !this.canApply();
        this.removeButton.disabled = !this._canRemove;
    }

    private currentExpression(): string {
        if (this._mode === "advanced") {
            return this._advancedExpression.trim();
        }
        if (this._mode === "field" && this._fieldDraft.path) {
            return fieldExpression(this._fieldDraft);
        }
        return selectedSourceConditions(this._sources, this._selected)
            .map((condition) => `${condition.sourceEditor.target.localName}.${condition.sourceState}`)
            .join(" || ");
    }

    private canApply(): boolean {
        if (this._mode === "source") {
            return this._selected.size > 0;
        }
        return this.currentExpression().trim().length > 0;
    }

    private readonly apply = (): void => {
        if (!this.canApply()) {
            return;
        }
        const detail =
            this._mode === "source"
                ? { conditions: selectedSourceConditions(this._sources, this._selected) }
                : { conditions: [], expression: this.currentExpression().trim() };
        this.dispatchEvent(
            new CustomEvent<ConditionPickerApplyDetail>(CONDITION_PICKER_APPLY_EVENT, {
                bubbles: true,
                composed: true,
                detail,
            }),
        );
        this.close();
    };

    private readonly removeCondition = (): void => {
        if (!this._canRemove) {
            return;
        }
        this.dispatchEvent(new CustomEvent(CONDITION_PICKER_REMOVE_EVENT, { bubbles: true, composed: true }));
        this.close();
    };

    private readonly onBackdropClick = (event: Event): void => {
        if (event.target === this.backdrop) {
            this.close();
        }
    };
    private readonly onKeydown = (event: KeyboardEvent): void => {
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
    private get body(): HTMLElement {
        return this.shadowRoot!.querySelector(".body")!;
    }
    private get summary(): HTMLElement {
        return this.shadowRoot!.querySelector(".summary")!;
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
