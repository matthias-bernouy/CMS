import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { renderAdvancedMode } from "./Modes/advancedMode";
import { dispatchConditionApply, dispatchConditionRemove } from "./Modes/conditionPickerEvents";
import {
    conditionExpression,
    conditionSummaryParts,
    type ConditionPickerElements,
    queryConditionPickerElements,
    renderConditionModes,
    renderConditionSummary,
} from "./Modes/conditionPickerView";
import { defaultFieldDraft, renderFieldMode } from "./Modes/fieldMode";
import { renderSourceStateMode, selectedSourceConditions, sourceStateKey } from "./Modes/sourceStateMode";
import type {
    ConditionFieldOption,
    ConditionPickerApplyDetail,
    ConditionPickerCondition,
    ConditionPickerMode,
    ConditionPickerOpenOptions,
    ConditionPickerSource,
    FieldConditionDraft,
} from "./Modes/types";

export type {
    ConditionFieldOption,
    ConditionPickerApplyDetail,
    ConditionPickerCondition,
    ConditionPickerSource,
} from "./Modes/types";
export { CONDITION_PICKER_APPLY_EVENT, CONDITION_PICKER_REMOVE_EVENT } from "./Modes/conditionPickerEvents";

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
    private readonly elements: ConditionPickerElements;

    constructor() {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.append(template.content.cloneNode(true));
        this.elements = queryConditionPickerElements(shadowRoot);
        this.elements.closeButton.addEventListener("click", this.close);
        this.elements.backdrop.addEventListener("click", this.onBackdropClick);
        this.elements.applyButton.addEventListener("click", this.apply);
        this.elements.removeButton.addEventListener("click", this.removeCondition);
    }

    connectedCallback(): void {
        this.ownerDocument.addEventListener("keydown", this.onKeydown);
    }
    disconnectedCallback(): void {
        this.ownerDocument.removeEventListener("keydown", this.onKeydown);
    }

    open(options: ConditionPickerOpenOptions): void {
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
        this.elements.subtitle.textContent = options.contextLabel
            ? `Conditions for ${options.contextLabel}.`
            : "Conditions";
        this.elements.backdrop.hidden = false;
        this.render();
    }

    readonly close = (): void => {
        this.elements.backdrop.hidden = true;
    };

    private render(): void {
        this.elements.body.replaceChildren(
            renderConditionModes(this._mode, (mode) => {
                this._mode = mode;
                this.render();
            }),
            this.renderPanel(),
            renderConditionSummary(this.currentExpression()),
        );
        this.syncActions();
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

    private syncSummary(): void {
        this.shadowRoot!.querySelector(".summary")!.replaceChildren(...conditionSummaryParts(this.currentExpression()));
        this.syncActions();
    }

    private syncActions(): void {
        this.elements.applyButton.disabled = !this.canApply();
        this.elements.removeButton.disabled = !this._canRemove;
    }

    private currentExpression(): string {
        return conditionExpression({
            mode: this._mode,
            advancedExpression: this._advancedExpression,
            fieldDraft: this._fieldDraft,
            sources: this._sources,
            selected: this._selected,
        });
    }

    private canApply(): boolean {
        return this._mode === "source" ? this._selected.size > 0 : this.currentExpression().trim().length > 0;
    }

    private readonly apply = (): void => {
        if (!this.canApply()) {
            return;
        }
        const detail =
            this._mode === "source"
                ? { conditions: selectedSourceConditions(this._sources, this._selected) }
                : { conditions: [], expression: this.currentExpression().trim() };
        dispatchConditionApply(this, detail);
        this.close();
    };

    private readonly removeCondition = (): void => {
        if (!this._canRemove) {
            return;
        }
        dispatchConditionRemove(this);
        this.close();
    };

    private readonly onBackdropClick = (event: Event): void => {
        if (event.target === this.elements.backdrop) {
            this.close();
        }
    };
    private readonly onKeydown = (event: KeyboardEvent): void => {
        if (!this.elements.backdrop.hidden && event.key === "Escape") {
            this.close();
        }
    };
}

if (!customElements.get("cms-editor-v2-condition-picker")) {
    customElements.define("cms-editor-v2-condition-picker", ConditionPicker);
}
