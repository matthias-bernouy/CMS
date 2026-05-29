import { applySortNavigation, applyFilterNavigation } from './emit';

export const handleSortClick = (host: HTMLElement, e: Event) => {
    if (e.composedPath().some(el => el instanceof HTMLInputElement)) return;
    applySortNavigation(host);
};

export const handleFilterToggle = (
    e: Event,
    btn: HTMLElement | null,
    popover: HTMLElement | null,
    input: HTMLInputElement | null,
) => {
    e.stopPropagation();
    if (!popover || !btn) return;
    const open = popover.hasAttribute('hidden');
    if (open) {
        popover.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        input?.focus();
    } else {
        popover.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
    }
};

export const handleFilterEnter = (host: HTMLElement, input: HTMLInputElement | null, e: KeyboardEvent) => {
    if (e.key !== 'Enter' || !input) return;
    applyFilterNavigation(host, input.value);
};

export const closeFilterPopover = (btn: HTMLElement | null, popover: HTMLElement | null) => {
    popover?.setAttribute('hidden', '');
    btn?.setAttribute('aria-expanded', 'false');
};
