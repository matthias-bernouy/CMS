import { clamp, syncFill } from './compute';

export const syncBounds = (
    host: HTMLElement,
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
    minEl: HTMLElement | null, maxEl: HTMLElement | null,
) => {
    if (!slider || !input || !minEl || !maxEl) return;
    const min = host.getAttribute('min') ?? '0';
    const max = host.getAttribute('max') ?? '100';
    const step = host.getAttribute('step') ?? '1';
    slider.min = min; slider.max = max; slider.step = step;
    input.min = min; input.max = max; input.step = step;
    minEl.textContent = min; maxEl.textContent = max;
};

export const syncLabel = (
    host: HTMLElement,
    labelEl: HTMLElement | null,
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
) => {
    if (!labelEl || !slider || !input) return;
    const label = host.getAttribute('label') ?? host.getAttribute('name') ?? '';
    labelEl.textContent = label;
    labelEl.hidden = label === '';
    if (label) {
        slider.setAttribute('aria-label', label);
        input.setAttribute('aria-label', label);
    }
};

export const syncUnit = (host: HTMLElement, unitEl: HTMLElement | null) => {
    if (!unitEl) return;
    const unit = host.getAttribute('unit') ?? '';
    unitEl.textContent = unit;
    unitEl.hidden = unit === '';
};

export const syncDisabled = (
    host: HTMLElement,
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
) => {
    if (!slider || !input) return;
    const disabled = host.hasAttribute('disabled');
    slider.disabled = disabled;
    input.disabled = disabled;
};

export const syncValue = (
    slider: HTMLInputElement | null,
    input: HTMLInputElement | null,
    fill: HTMLElement | null,
    internals: ElementInternals,
    raw: string,
) => {
    if (!slider || !input) return;
    const v = clamp(slider, Number(raw));
    slider.value = String(v);
    input.value = String(v);
    internals.setFormValue(slider.value);
    syncFill(slider, fill);
};
