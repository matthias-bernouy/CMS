import type { WDetailField } from "../types";

export type ValueControl = HTMLElement & { value: string };
export type TokenControl = ValueControl & { values: string[] };

export function bindFieldControl(control: HTMLElement, field: WDetailField): void {
    control.dataset.fieldControl = field.id;
}

export function applyRemoteLookupMetadata(
    control: HTMLElement,
    field: Pick<WDetailField, "lookupKey" | "remoteSearch" | "remotePagination" | "lookupLoading" | "lookupHasMore">,
): void {
    if (field.lookupKey) {
        control.dataset.lookupTarget = field.lookupKey;
    }
    control.toggleAttribute("remote-search", field.remoteSearch === true);
    control.toggleAttribute("remote-pagination", field.remotePagination === true);
    control.toggleAttribute("loading", field.lookupLoading === true);
    control.toggleAttribute("has-more", field.lookupHasMore === true);
}

export function optionElement(option: { label: string; value: string }, value: string): HTMLOptionElement {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === value;
    return element;
}

export function selectOptionElements(
    options: Array<{ label: string; value: string }>,
    value: string,
): HTMLOptionElement[] {
    const elements = options.map((option) => optionElement(option, value));
    if (value !== "" || options.some((option) => option.value === "")) {
        return elements;
    }
    const placeholder = optionElement({ label: "Select an option", value: "" }, value);
    placeholder.disabled = true;
    return [placeholder, ...elements];
}

export function isValueControl(control: HTMLElement): control is ValueControl {
    return "value" in control && typeof (control as ValueControl).value === "string";
}

export function isTokenControl(control: HTMLElement): control is TokenControl {
    return isValueControl(control) && "values" in control && Array.isArray((control as TokenControl).values);
}
