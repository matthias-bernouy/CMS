export type TypedControl = HTMLElement & {
    value?: unknown;
    checked?: boolean;
    files?: FileList | File[];
    form?: HTMLFormElement | null;
};

export function typedControls(form: HTMLFormElement): TypedControl[] {
    const id = form.getAttribute("id");
    const candidates = new Set<TypedControl>(Array.from(form.elements) as TypedControl[]);
    for (const element of Array.from(form.ownerDocument.querySelectorAll<HTMLElement>("[name]"))) {
        const associated = (element.constructor as typeof HTMLElement & { formAssociated?: boolean }).formAssociated;
        if (
            associated &&
            (element.getAttribute("form") ? element.getAttribute("form") === id : element.closest("form") === form)
        ) {
            candidates.add(element);
        }
    }
    return [...candidates].filter((control) => {
        if (!control.getAttribute("name") || control.matches(":disabled, [disabled], [readonly]")) {
            return false;
        }
        return control.localName !== "fieldset" && control.localName !== "button";
    });
}

export function controlValue(control: TypedControl): unknown {
    const view = control.ownerDocument.defaultView!;
    if (control instanceof view.HTMLInputElement) {
        if (
            ["submit", "reset", "button", "image"].includes(control.type) ||
            (control.type === "radio" && !control.checked)
        ) {
            return undefined;
        }
        if (control.type === "checkbox") {
            return control.checked;
        }
        if (control.type === "file") {
            if (control.files?.length) {
                throw new Error("Binary files require a multipart form.");
            }
            return undefined;
        }
    }
    if (!(control instanceof view.HTMLInputElement) && typeof control.checked === "boolean") {
        return control.checked;
    }
    if (control.files?.length) {
        throw new Error("Binary files require a multipart form.");
    }
    const raw =
        control instanceof view.HTMLSelectElement && control.multiple
            ? Array.from(control.options)
                  .filter((option) => option.selected)
                  .map((option) => option.value)
            : control.value;
    const type =
        control.getAttribute("cms-form-value-type") ??
        (["number", "range"].includes(control.getAttribute("type") ?? "") ? "number" : "string");
    const empty = control.getAttribute("cms-form-empty");
    if (empty !== null && !["null", "omit"].includes(empty)) {
        throw new Error("cms-form-empty must be null or omit.");
    }
    if (!["string", "number", "boolean", "json"].includes(type)) {
        throw new Error("cms-form-value-type must be string, number, boolean or json.");
    }
    if (raw === "" || raw === undefined) {
        return empty === "null" ? null : empty === "omit" || type !== "string" ? undefined : raw;
    }
    if (typeof raw !== "string") {
        return raw;
    }
    if (type === "number") {
        if (!raw.trim() || !Number.isFinite(Number(raw))) {
            throw new Error(`Invalid number in ${control.getAttribute("name")}.`);
        }
        return Number(raw);
    }
    if (type === "boolean") {
        if (raw !== "true" && raw !== "false") {
            throw new Error(`Invalid boolean in ${control.getAttribute("name")}.`);
        }
        return raw === "true";
    }
    if (type === "json") {
        try {
            return JSON.parse(raw);
        } catch {
            throw new Error(`Invalid JSON in ${control.getAttribute("name")}.`);
        }
    }
    return raw;
}
