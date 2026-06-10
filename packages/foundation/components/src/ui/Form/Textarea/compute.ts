export { upgradeProperty } from "@bernouy/components/base";

export const parseMaxCount = (host: HTMLElement): number | null => {
    const raw = host.getAttribute('max-count');
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
};

export const updateCounter = (
    host: HTMLElement,
    textarea: HTMLTextAreaElement | null,
    counter: HTMLElement | null,
    countEl: HTMLElement | null,
) => {
    if (!textarea || !counter || !countEl) return;
    const max = parseMaxCount(host);
    if (max === null) return;
    const len = textarea.value.length;
    countEl.textContent = String(len);
    counter.dataset.over = String(len > max);
};

export const refreshMetaVisibility = (
    hint: HTMLElement | null, counter: HTMLElement | null, meta: HTMLElement | null,
) => {
    if (!hint || !counter || !meta) return;
    const hasHint = (hint.textContent ?? '').length > 0;
    const hasCounter = !counter.hidden;
    meta.hidden = !hasHint && !hasCounter;
};

export const autosize = (host: HTMLElement, textarea: HTMLTextAreaElement | null) => {
    if (!textarea || !host.hasAttribute('autosize')) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
};
