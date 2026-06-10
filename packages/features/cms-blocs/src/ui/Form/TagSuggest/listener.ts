import { refreshSuggestions, hide, select, removeLastTag, renderList, liveSelectSingle } from './domain/state';

export const onFocus = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) return;
    refreshSuggestions(host, input.value.trim().toLowerCase());
};

export const onBlur = (host: HTMLElement) => {
    setTimeout(() => hide(host), 150);
};

export const onInput = (host: HTMLElement, input: HTMLInputElement | null) => {
    if (!input) return;
    refreshSuggestions(host, input.value.trim().toLowerCase());
    if ((host.getAttribute('mode') || 'multiple') === 'single') {
        liveSelectSingle(host, input.value);
    }
};

export const onKeyDown = (host: HTMLElement, input: HTMLInputElement | null, e: KeyboardEvent) => {
    if (!input) return;
    const mode = host.getAttribute('mode') || 'multiple';
    const h = host as any;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (h._suggestions.length === 0) return;
        h._activeIndex = Math.min(h._activeIndex + 1, h._suggestions.length - 1);
        renderList(host);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (h._suggestions.length === 0) return;
        h._activeIndex = Math.max(h._activeIndex - 1, -1);
        renderList(host);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const picked = h._activeIndex >= 0 ? h._suggestions[h._activeIndex] : undefined;
        if (picked) select(host, picked.value);
        else { const v = input.value.trim(); if (v) select(host, v); }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hide(host);
    } else if (e.key === 'Backspace' && input.value === '' && mode === 'multiple') {
        removeLastTag(host);
    } else if (e.key === ',' && mode === 'multiple') {
        e.preventDefault();
        const v = input.value.trim();
        if (v) select(host, v);
    }
};
