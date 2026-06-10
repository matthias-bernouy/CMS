import { activateTab } from './domain/tabs';

export const handleTablistClick = (
    host: HTMLElement,
    tablist: HTMLElement | null,
    slot: HTMLSlotElement | null,
    e: Event,
) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab');
    if (!target || target.hasAttribute('disabled')) return;
    const id = target.dataset.target;
    if (id) activateTab(host, tablist, slot, id);
};

export const handleKeydown = (
    host: HTMLElement,
    tablist: HTMLElement | null,
    slot: HTMLSlotElement | null,
    e: KeyboardEvent,
) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = Array.from(tablist?.querySelectorAll<HTMLButtonElement>('.tab:not([disabled])') ?? []);
    if (tabs.length === 0) return;
    const current = tabs.findIndex(t => t === document.activeElement);
    const fallback = current === -1 ? 0 : current;
    let next = fallback;
    if (e.key === 'ArrowLeft')  next = (fallback - 1 + tabs.length) % tabs.length;
    if (e.key === 'ArrowRight') next = (fallback + 1) % tabs.length;
    if (e.key === 'Home')       next = 0;
    if (e.key === 'End')        next = tabs.length - 1;
    e.preventDefault();
    const target = tabs[next];
    if (!target) return;
    const id = target.dataset.target;
    if (id) activateTab(host, tablist, slot, id);
    target.focus();
};
