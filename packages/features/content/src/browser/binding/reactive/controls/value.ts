type FormControl = HTMLElement & { value?: unknown; checked?: boolean };

/** Synchronize ordinary bound attributes with the live value of supported form controls. */
export function applyControlAttribute(element: HTMLElement, name: string, value: unknown): void {
    const view = element.ownerDocument.defaultView;
    if (!view) {
        return;
    }
    const control = element as FormControl;
    const associated = (element.constructor as typeof HTMLElement & { formAssociated?: boolean }).formAssociated;
    const input = element instanceof view.HTMLInputElement;
    if (name === "selected" && element instanceof view.HTMLOptionElement) {
        if (element.selected !== (value === true)) {
            element.selected = value === true;
        }
        return;
    }
    if (name === "checked") {
        if ((input || associated) && typeof control.checked === "boolean" && control.checked !== (value === true)) {
            control.checked = value === true;
        }
        return;
    }
    const native =
        element instanceof view.HTMLTextAreaElement ||
        element instanceof view.HTMLSelectElement ||
        (input && element.type !== "file");
    if (name === "value" && (native || associated) && "value" in control) {
        const next = value == null ? "" : String(value);
        if (control.value !== next) {
            control.value = next;
        }
    }
}
