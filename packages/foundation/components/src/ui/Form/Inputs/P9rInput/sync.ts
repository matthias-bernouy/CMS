import { parseMaxCount } from "./compute";

export const P9R_INPUT_ATTRIBUTES = [
    "value",
    "label",
    "aria-label",
    "placeholder",
    "type",
    "inputmode",
    "enterkeyhint",
    "autocomplete",
    "autocapitalize",
    "spellcheck",
    "min",
    "max",
    "step",
    "minlength",
    "maxlength",
    "pattern",
    "readonly",
    "hint",
    "hint-level",
    "help",
    "error",
    "max-count",
    "invalid",
    "disabled",
    "required",
] as const;

export const syncLabel = (host: HTMLElement, label: HTMLLabelElement | null) => {
    if (!label) {
        return;
    }
    const text = host.getAttribute("label") ?? "";
    label.textContent = text;
    label.hidden = text === "";
};

const syncPlaceholder = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    const value = host.getAttribute("placeholder");
    if (value === null) {
        input.removeAttribute("placeholder");
    } else {
        input.setAttribute("placeholder", value);
    }
};

const syncTextAttributes = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    for (const name of [
        "aria-label",
        "autocomplete",
        "autocapitalize",
        "enterkeyhint",
        "spellcheck",
        "minlength",
        "maxlength",
        "pattern",
    ]) {
        const value = host.getAttribute(name);
        if (value === null) {
            input.removeAttribute(name);
        } else {
            input.setAttribute(name, value);
        }
    }
    input.readOnly = host.hasAttribute("readonly");
};

const syncType = (host: HTMLElement, input: HTMLInputElement | null) => {
    input?.setAttribute("type", host.getAttribute("type") ?? "text");
};

const syncInputMode = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    const value = host.getAttribute("inputmode");
    if (value === null) {
        input.removeAttribute("inputmode");
    } else {
        input.setAttribute("inputmode", value);
    }
};

const syncNumericConstraints = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    for (const name of ["min", "max", "step"] as const) {
        const value = host.getAttribute(name);
        if (value === null) {
            input.removeAttribute(name);
        } else {
            input.setAttribute(name, value);
        }
    }
};

const syncState = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    input.disabled = host.hasAttribute("disabled");
    input.required = host.hasAttribute("required");
    if (input.required) {
        input.setAttribute("aria-required", "true");
    } else {
        input.removeAttribute("aria-required");
    }
};

export const syncMaxCount = (host: HTMLElement, counter: HTMLElement | null, max: HTMLElement | null) => {
    if (!counter || !max) {
        return;
    }
    const value = parseMaxCount(host);
    counter.hidden = value === null;
    if (value !== null) {
        max.textContent = String(value);
    }
};

export const syncAll = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    label: HTMLLabelElement | null,
    counter: HTMLElement | null,
    max: HTMLElement | null,
) => {
    syncLabel(host, label);
    syncPlaceholder(host, input);
    syncTextAttributes(host, input);
    syncType(host, input);
    syncInputMode(host, input);
    syncNumericConstraints(host, input);
    syncState(host, input);
    syncMaxCount(host, counter, max);
};
