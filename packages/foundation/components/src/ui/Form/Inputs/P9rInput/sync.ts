import { parseMaxCount, refreshMetaVisibility } from "./compute";

export const syncLabel = (host: HTMLElement, label: HTMLLabelElement | null) => {
    if (!label) {
        return;
    }
    const text = host.getAttribute("label") ?? "";
    label.textContent = text;
    label.hidden = text === "";
};

export const syncPlaceholder = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    const v = host.getAttribute("placeholder");
    if (v === null) {
        input.removeAttribute("placeholder");
    } else {
        input.setAttribute("placeholder", v);
    }
};

export const syncType = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    input.setAttribute("type", host.getAttribute("type") ?? "text");
};

export const syncInputMode = (host: HTMLElement, input: HTMLInputElement | null) => {
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

export const syncNumericConstraints = (host: HTMLElement, input: HTMLInputElement | null) => {
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

export const syncDisabled = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (input) {
        input.disabled = host.hasAttribute("disabled");
    }
};

export const syncRequired = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    const required = host.hasAttribute("required");
    input.required = required;
    if (required) {
        input.setAttribute("aria-required", "true");
    } else {
        input.removeAttribute("aria-required");
    }
};

export const syncHint = (
    host: HTMLElement,
    hint: HTMLElement | null,
    counter: HTMLElement | null,
    meta: HTMLElement | null,
) => {
    if (!hint) {
        return;
    }
    hint.textContent = host.getAttribute("hint") ?? "";
    refreshMetaVisibility(hint, counter, meta);
};

export const syncHintLevel = (host: HTMLElement, hint: HTMLElement | null) => {
    if (!hint) {
        return;
    }
    hint.dataset.level = host.getAttribute("hint-level") ?? "info";
};

export const syncInvalid = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) {
        return;
    }
    if (host.hasAttribute("invalid")) {
        input.setAttribute("aria-invalid", "true");
    } else {
        input.removeAttribute("aria-invalid");
    }
};

export const syncMaxCount = (
    host: HTMLElement,
    counter: HTMLElement | null,
    max: HTMLElement | null,
    hint: HTMLElement | null,
    meta: HTMLElement | null,
) => {
    if (!counter || !max) {
        return;
    }
    const value = parseMaxCount(host);
    if (value === null) {
        counter.hidden = true;
    } else {
        counter.hidden = false;
        max.textContent = String(value);
    }
    refreshMetaVisibility(hint, counter, meta);
};

export const syncAll = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    label: HTMLLabelElement | null,
    hint: HTMLElement | null,
    meta: HTMLElement | null,
    counter: HTMLElement | null,
    max: HTMLElement | null,
) => {
    syncLabel(host, label);
    syncPlaceholder(host, input);
    syncType(host, input);
    syncInputMode(host, input);
    syncNumericConstraints(host, input);
    syncDisabled(host, input);
    syncRequired(host, input);
    syncHint(host, hint, counter, meta);
    syncHintLevel(host, hint);
    syncInvalid(host, input);
    syncMaxCount(host, counter, max, hint, meta);
};
