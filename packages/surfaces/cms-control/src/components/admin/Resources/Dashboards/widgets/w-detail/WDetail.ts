import { Component } from "@bernouy/components/base";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import {
    emitWidgetEvent,
    setText,
    WIDGET_ACTION_EVENT,
    WIDGET_BACK_EVENT,
    WIDGET_FIELD_CHANGE_EVENT,
    WIDGET_MEDIA_ACTION_EVENT,
} from "../shared";
import "../w-section/WSection";
import { W_MEDIA_FIELD_ACTION_EVENT, type DashboardMediaActionDetail } from "../w-media-field/types";
import { detailData, fieldValues, type DetailOptions } from "../../runtime/mapping";
import { valueAt } from "../../runtime/expressions";
import { detailLookupOptions } from "../../runtime/lookups";
import { renderDetailActions } from "./actions";
import { createFieldControl, fieldUsesInternalLabel, readFieldControlValue } from "./controls";
import type { WDetailData, WDetailField, WDetailSection } from "./types";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWDetail extends Component {
    private value: WDetailData = { rowKey: "", eyebrow: "", title: "", actions: [], main: [], aside: [] };
    private bound = false;
    private dynamicOptions: DetailOptions = {};
    private optionsRequestKey = "";
    private optionsScopeKey = "";

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    set data(value: WDetailData) {
        this.value = value;
        if (this.isConnected) this.render();
    }

    applyLookupCreate(fieldId: string, value: unknown, option: { value: string; label: string }): void {
        const control = this.fieldControl(fieldId);
        const field = control ? this.findField(fieldId) : undefined;
        if (!control || !field) return;
        appendOption(control, option);
        const nextValue = Array.isArray(value) ? value.map(String).join(",") : String(value ?? "");
        control.setAttribute("value", nextValue);
        if ("value" in control && typeof (control as { value: unknown }).value === "string") {
            (control as { value: string }).value = nextValue;
        }
    }

    static get observedAttributes(): string[] {
        return ["data-config-json", "data-source-json", "data-row-key", "data-source-id"];
    }

    attributeChangedCallback(): void {
        this.syncBoundData();
    }

    override connectedCallback(): void {
        if (!this.bound) {
            this.shadowRoot!.addEventListener("click", this.onClick);
            this.shadowRoot!.addEventListener("change", this.onChange);
            this.shadowRoot!.addEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
            this.bound = true;
        }
        this.syncBoundData();
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        this.shadowRoot?.removeEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
        this.bound = false;
    }

    private render(): void {
        setText(this.shadowRoot!, "[data-title]", this.value.title);
        this.renderActions();
        this.renderSections(this.query("[data-main]"), this.value.main);
        this.renderSections(this.query("[data-aside]"), this.value.aside, "compact");
    }

    private renderActions(): void {
        const root = this.query<HTMLElement>("[data-actions]");
        root.replaceChildren(...renderDetailActions(this.value.actions));
    }

    private renderSections(root: HTMLElement, sections: WDetailSection[], density?: string): void {
        root.replaceChildren(...sections.map(section => this.renderSection(section, density)));
        root.hidden = sections.length === 0;
    }

    private renderSection(section: WDetailSection, density?: string): HTMLElement {
        const node = this.template("section");
        node.setAttribute("heading", section.title);
        if (section.description) node.setAttribute("description", section.description);
        if (density) node.setAttribute("density", density);
        node.querySelector<HTMLElement>("[data-fields]")!
            .replaceChildren(...section.fields.map(field => this.renderField(field)));
        return node;
    }

    private renderField(field: WDetailField): HTMLElement {
        const node = this.template("field");
        setText(node, "[data-field-label]", field.label);
        node.toggleAttribute("data-internal-label", fieldUsesInternalLabel(field));
        node.querySelector<HTMLElement>("[data-field-value]")!.append(createFieldControl(field));
        return node;
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        if (target?.closest("[data-back]")) emitWidgetEvent(this, WIDGET_BACK_EVENT, {});
        const action = findActionTarget(event);
        if (action?.dataset.action) emitWidgetEvent(this, WIDGET_ACTION_EVENT, {
            action: action.dataset.action,
            resource: this.currentResource(),
            fields: this.currentFields(),
        });
        const chip = target?.closest<HTMLButtonElement>(".chip");
        if (chip) this.toggleChip(chip);
    };

    private onChange = (event: Event): void => {
        const control = (event.target as Element | null)?.closest<HTMLElement>("[data-field-control]");
        if (control) this.emitFieldChange(control, Boolean((event as CustomEvent<{ created?: boolean }>).detail?.created));
    };

    private onMediaAction = (event: CustomEvent<DashboardMediaActionDetail>): void => {
        event.stopPropagation();
        const control = (event.target as Element | null)?.closest<HTMLElement>("[data-field-control]");
        const field = control ? this.findField(control.dataset.fieldControl ?? "") : undefined;
        if (!field) return;
        emitWidgetEvent(this, WIDGET_MEDIA_ACTION_EVENT, {
            ...event.detail,
            rowKey: this.value.rowKey,
            field: field.id,
        });
    };

    private toggleChip(chip: HTMLButtonElement): void {
        chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
        const control = chip.closest<HTMLElement>("[data-field-control]");
        if (control) this.emitFieldChange(control);
    }

    private emitFieldChange(control: HTMLElement, created = false): void {
        const field = this.findField(control.dataset.fieldControl ?? "");
        if (!field) return;
        emitWidgetEvent(this, WIDGET_FIELD_CHANGE_EVENT, {
            rowKey: this.value.rowKey,
            field: field.id,
            value: readFieldControlValue(field, control),
            ...(created ? { created } : {}),
        });
    }

    private syncBoundData(): void {
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-detail") return;
        const sourceJson = this.dataset.sourceJson ?? "";
        const sourceData = parseJson<unknown>(sourceJson) ?? {};
        const resource = widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
        const rowKey = this.dataset.rowKey ?? "";
        const sourceId = this.dataset.sourceId ?? "";
        const scopeKey = `${sourceId}:${widget.id}:${rowKey}`;
        if (this.optionsScopeKey !== scopeKey) {
            this.optionsScopeKey = scopeKey;
            this.dynamicOptions = {};
        }
        this.value = detailData(widget, resource, rowKey, {}, this.dynamicOptions, sourceId);
        if (this.isConnected) this.render();
        if (!sourceJson || !sourceId) return;
        void this.loadLookupOptions(widget, resource, rowKey, sourceId);
    }

    private async loadLookupOptions(widget: DetailWidget, resource: unknown, rowKey: string, sourceId: string): Promise<void> {
        const requestKey = `${sourceId}:${widget.id}:${rowKey}:${this.dataset.sourceJson ?? ""}`;
        this.optionsRequestKey = requestKey;
        try {
            const options = await detailLookupOptions(sourceId, widget, resource, fieldValues(widget, resource));
            if (this.optionsRequestKey !== requestKey) return;
            this.dynamicOptions = options;
            this.value = detailData(widget, resource, rowKey, {}, options, sourceId);
            if (this.isConnected) this.render();
        } catch {
            if (this.optionsRequestKey === requestKey) this.dynamicOptions = {};
        }
    }

    private findField(id: string): WDetailField | undefined {
        return [...this.value.main, ...this.value.aside].flatMap(section => section.fields).find(field => field.id === id);
    }

    private currentResource(): unknown | undefined {
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-detail") return undefined;
        const sourceData = parseJson<unknown>(this.dataset.sourceJson ?? "");
        if (sourceData === null) return undefined;
        return widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
    }

    private currentFields(): Record<string, unknown> {
        const fields: Record<string, unknown> = {};
        for (const control of Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-field-control]"))) {
            const field = this.findField(control.dataset.fieldControl ?? "");
            if (field) fields[field.id] = readFieldControlValue(field, control);
        }
        return fields;
    }

    private fieldControl(fieldId: string): HTMLElement | null {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-field-control]"))
            .find(control => control.dataset.fieldControl === fieldId) ?? null;
    }

    private template(kind: "section" | "field"): HTMLElement {
        const selector = kind === "section" ? "[data-section-template]" : "[data-field-template]";
        return this.query<HTMLTemplateElement>(selector).content.firstElementChild!.cloneNode(true) as HTMLElement;
    }

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboard-w-detail")) customElements.define("cms-dashboard-w-detail", DashboardWDetail);

export type { WDetailData, WDetailField, WDetailSection };

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

function parseJson<T>(value: string): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function findActionTarget(event: Event): HTMLElement | undefined {
    return event.composedPath().find((target): target is HTMLElement =>
        target instanceof HTMLElement && Boolean(target.dataset.action),
    );
}

function appendOption(control: HTMLElement, option: { value: string; label: string }): void {
    const existing = Array.from(control.querySelectorAll<HTMLOptionElement>("option"))
        .find(item => item.value === option.value);
    if (existing) {
        existing.textContent = option.label;
        return;
    }
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    control.append(element);
}
