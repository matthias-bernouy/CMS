import { Component } from "@bernouy/components/base";
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
import { renderDetailActions } from "./actions";
import { createFieldControl, fieldUsesInternalLabel, readFieldControlValue } from "./controls";
import type { WDetailData, WDetailField, WDetailSection } from "./types";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWDetail extends Component {
    private value: WDetailData = { rowKey: "", eyebrow: "", title: "", actions: [], main: [], aside: [] };
    private bound = false;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    set data(value: WDetailData) {
        this.value = value;
        if (this.isConnected) this.render();
    }

    override connectedCallback(): void {
        if (!this.bound) {
            this.shadowRoot!.addEventListener("click", this.onClick);
            this.shadowRoot!.addEventListener("change", this.onChange);
            this.shadowRoot!.addEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
            this.bound = true;
        }
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
        if (action?.dataset.action) emitWidgetEvent(this, WIDGET_ACTION_EVENT, { action: action.dataset.action });
        const chip = target?.closest<HTMLButtonElement>(".chip");
        if (chip) this.toggleChip(chip);
    };

    private onChange = (event: Event): void => {
        const control = (event.target as Element | null)?.closest<HTMLElement>("[data-field-control]");
        if (control) this.emitFieldChange(control);
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

    private emitFieldChange(control: HTMLElement): void {
        const field = this.findField(control.dataset.fieldControl ?? "");
        if (!field) return;
        emitWidgetEvent(this, WIDGET_FIELD_CHANGE_EVENT, {
            rowKey: this.value.rowKey,
            field: field.id,
            value: readFieldControlValue(field, control),
        });
    }

    private findField(id: string): WDetailField | undefined {
        return [...this.value.main, ...this.value.aside].flatMap(section => section.fields).find(field => field.id === id);
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

function findActionTarget(event: Event): HTMLElement | undefined {
    return event.composedPath().find((target): target is HTMLElement =>
        target instanceof HTMLElement && Boolean(target.dataset.action),
    );
}
