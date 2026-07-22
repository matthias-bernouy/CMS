import { parseMaxCount, refreshMetaVisibility } from "./compute";

export const syncLabel = (host: HTMLElement, label: HTMLLabelElement | null) => {
    if (!label) {
        return;
    }
    const text = host.getAttribute("label") ?? "";
    label.textContent = text;
    label.hidden = text === "";
};

export const syncPlaceholder = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
        return;
    }
    const v = host.getAttribute("placeholder");
    if (v === null) {
        textarea.removeAttribute("placeholder");
    } else {
        textarea.setAttribute("placeholder", v);
    }
};

export const syncRows = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
        return;
    }
    const r = host.getAttribute("rows");
    if (r) {
        textarea.rows = Number(r) || 3;
    }
};

export const syncMaxLength = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
        return;
    }
    const v = host.getAttribute("maxlength");
    if (v === null) {
        textarea.removeAttribute("maxlength");
    } else {
        textarea.setAttribute("maxlength", v);
    }
};

export const syncDisabled = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
        textarea.disabled = host.hasAttribute("disabled");
    }
};

export const syncRequired = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
        return;
    }
    const required = host.hasAttribute("required");
    textarea.required = required;
    if (required) {
        textarea.setAttribute("aria-required", "true");
    } else {
        textarea.removeAttribute("aria-required");
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

export const syncInvalid = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (!textarea) {
        return;
    }
    if (host.hasAttribute("invalid")) {
        textarea.setAttribute("aria-invalid", "true");
    } else {
        textarea.removeAttribute("aria-invalid");
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
    textarea: HTMLTextAreaElement | null,
    label: HTMLLabelElement | null,
    hint: HTMLElement | null,
    meta: HTMLElement | null,
    counter: HTMLElement | null,
    max: HTMLElement | null,
) => {
    syncLabel(host, label);
    syncPlaceholder(host, textarea);
    syncRows(host, textarea);
    syncMaxLength(host, textarea);
    syncDisabled(host, textarea);
    syncRequired(host, textarea);
    syncHint(host, hint, counter, meta);
    syncHintLevel(host, hint);
    syncInvalid(host, textarea);
    syncMaxCount(host, counter, max, hint, meta);
};
