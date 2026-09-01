import { setText } from "../../shared";
import { renderDetailActions } from "./actions";
import { createFieldControl, fieldUsesInternalLabel } from "../controls";
import type { WDetailData, WDetailField, WDetailSection } from "../types";

export class DetailView {
    constructor(private readonly root: ShadowRoot) {}

    render(value: WDetailData): void {
        setText(this.root, "[data-title]", value.title);
        this.renderActions(value.actions);
        this.renderSections(this.query("[data-main]"), value.main);
        this.renderSections(this.query("[data-aside]"), value.aside, "compact");
    }

    refresh(previous: WDetailData, next: WDetailData): void {
        if (previous.title !== next.title) {
            setText(this.root, "[data-title]", next.title);
        }
        if (!sameActions(previous.actions, next.actions)) {
            this.renderActions(next.actions);
        }
        if (!sameSectionFields(previous.main, next.main)) {
            this.renderSections(this.query("[data-main]"), next.main);
        }
        if (!sameSectionFields(previous.aside, next.aside)) {
            this.renderSections(this.query("[data-aside]"), next.aside, "compact");
        }
    }

    private renderActions(actions: WDetailData["actions"]): void {
        this.query<HTMLElement>("[data-actions]").replaceChildren(...renderDetailActions(actions));
    }

    private renderSections(root: HTMLElement, sections: WDetailSection[], density?: string): void {
        root.replaceChildren(...sections.map((section) => this.renderMainItem(section, density)));
        root.hidden = sections.length === 0;
    }

    private renderMainItem(section: WDetailSection, density?: string): HTMLElement {
        if (!section.widgetSlot) {
            return this.renderSection(section, density);
        }
        const slot = document.createElement("slot");
        slot.setAttribute("name", section.widgetSlot);
        return slot;
    }

    private renderSection(section: WDetailSection, density?: string): HTMLElement {
        const node = this.template("section");
        node.setAttribute("heading", section.title);
        if (section.description) {
            node.setAttribute("description", section.description);
        }
        if (density) {
            node.setAttribute("density", density);
        }
        node.querySelector<HTMLElement>("[data-fields]")!.replaceChildren(
            ...section.fields.map((field) => this.renderField(field)),
        );
        return node;
    }

    private renderField(field: WDetailField): HTMLElement {
        const node = this.template("field");
        setText(node, "[data-field-label]", field.label);
        node.toggleAttribute("data-internal-label", fieldUsesInternalLabel(field));
        node.querySelector<HTMLElement>("[data-field-value]")!.append(createFieldControl(field));
        return node;
    }

    private template(kind: "section" | "field"): HTMLElement {
        const selector = kind === "section" ? "[data-section-template]" : "[data-field-template]";
        return this.query<HTMLTemplateElement>(selector).content.firstElementChild!.cloneNode(true) as HTMLElement;
    }

    private query<T extends Element>(selector: string): T {
        return this.root.querySelector(selector) as T;
    }
}

export function applyLookupOption(
    control: HTMLElement,
    value: unknown,
    option: { value: string; label: string },
): void {
    const existing = Array.from(control.querySelectorAll<HTMLOptionElement>("option")).find(
        (item) => item.value === option.value,
    );
    if (existing) {
        existing.textContent = option.label;
    } else {
        const element = document.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        control.append(element);
    }
    const nextValue = Array.isArray(value) ? value.map(String).join(",") : String(value ?? "");
    control.setAttribute("value", nextValue);
    if ("value" in control && typeof (control as { value: unknown }).value === "string") {
        (control as { value: string }).value = nextValue;
    }
}

function sameActions(current: WDetailData["actions"], next: WDetailData["actions"]): boolean {
    return JSON.stringify(current) === JSON.stringify(next);
}

function sameSectionFields(current: WDetailSection[], next: WDetailSection[]): boolean {
    if (current.length !== next.length) {
        return false;
    }
    return current.every((section, sectionIndex) => {
        const nextSection = next[sectionIndex];
        return (
            nextSection !== undefined &&
            section.widgetSlot === nextSection.widgetSlot &&
            section.fields.length === nextSection.fields.length &&
            section.fields.every((field, fieldIndex) => sameFieldShape(field, nextSection.fields[fieldIndex]))
        );
    });
}

function sameFieldShape(current: WDetailField, next: WDetailField | undefined): boolean {
    if (!next || current.id !== next.id || current.input !== next.input) {
        return false;
    }
    if (current.input !== "schema" && next.input !== "schema") {
        return true;
    }
    return (
        current.schemaStatus === next.schemaStatus &&
        JSON.stringify(current.schemaDefinitions) === JSON.stringify(next.schemaDefinitions)
    );
}
