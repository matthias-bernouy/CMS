export { upgradeProperty } from "@bernouy/cms-blocs/base";

export const parseMaxCount = (host: HTMLElement): number | null => {
    const raw = host.getAttribute('max-count');
    if (raw === null) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
};

export const updateCounter = (
    host: HTMLElement,
    input: HTMLInputElement | null,
    counter: HTMLElement | null,
    countEl: HTMLElement | null,
) => {
    if (!input || !counter || !countEl) return;
    const max = parseMaxCount(host);
    if (max === null) return;
    const len = input.value.length;
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

let _uid = 0;
export const nextLabelId = () => `p9r-input-label-${++_uid}`;
