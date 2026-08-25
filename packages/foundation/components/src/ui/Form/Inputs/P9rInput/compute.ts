export { upgradeProperty } from "@bernouy/components/base";

export const parseMaxCount = (host: HTMLElement): number | null => {
    const raw = host.getAttribute("max-count");
    if (raw === null) {
        return null;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
};

export const updateCounter = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    counter: HTMLElement | null,
    countEl: HTMLElement | null,
) => {
    if (!input || !counter || !countEl) {
        return;
    }
    const max = parseMaxCount(host);
    if (max === null) {
        return;
    }
    const len = input.value.length;
    countEl.textContent = String(len);
    counter.dataset.over = String(len > max);
};

export const refreshMetaVisibility = (
    hint: HTMLElement | null,
    error: HTMLElement | null,
    counter: HTMLElement | null,
    meta: HTMLElement | null,
) => {
    if (!hint || !error || !counter || !meta) {
        return;
    }
    const hasHint = !hint.hidden && (hint.textContent ?? "").length > 0;
    const hasError = !error.hidden && (error.textContent ?? "").length > 0;
    const hasCounter = !counter.hidden;
    meta.hidden = !hasHint && !hasError && !hasCounter;
};
