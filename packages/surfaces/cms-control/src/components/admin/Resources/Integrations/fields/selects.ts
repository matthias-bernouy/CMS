import type { IntegrationInputOption } from "@bernouy/cms-integrations";
import type { IntegrationPageLink } from "../api";

export function configureSelect(
    control: HTMLSelectElement,
    options: IntegrationInputOption[],
    value: unknown,
    multiple: boolean,
): void {
    addOptions(control, options);
    control.multiple = multiple;
    const selected = new Set(Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
    for (const option of Array.from(control.options)) {
        option.selected = selected.has(option.value);
    }
}

export function configurePageLinkSelect(
    control: HTMLSelectElement,
    value: unknown,
    pageLinks?: Promise<IntegrationPageLink[]>,
): void {
    const current = typeof value === "string" ? value : "";
    addOptions(control, current ? [{ label: current, value: current }] : [], "Select a page");
    if (!pageLinks) {
        return;
    }
    void pageLinks.then(
        (links) => {
            addOptions(
                control,
                links.map((link) => ({ label: `${link.title} (${link.path})`, value: link.path })),
                "Select a page",
            );
            control.value = current;
        },
        () => {
            control.options[0]!.textContent = "Pages could not be loaded";
        },
    );
}

function addOptions(control: HTMLSelectElement, options: IntegrationInputOption[], placeholder?: string): void {
    control.replaceChildren();
    if (placeholder !== undefined) {
        control.append(option(placeholder, ""));
    }
    for (const item of options) {
        control.append(option(item.label, item.value));
    }
}

function option(label: string, value: string): HTMLOptionElement {
    const element = document.createElement("option");
    element.textContent = label;
    element.value = value;
    return element;
}
