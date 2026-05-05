import { getMenuItems } from './compute';

export const handleKeydown = (host: HTMLElement, e: KeyboardEvent) => {
    const slot = host.shadowRoot?.querySelector('slot:not([name])') as HTMLSlotElement | null;
    const items = getMenuItems(slot);
    if (items.length === 0) return;

    const active = document.activeElement;
    const currentIndex = items.findIndex(item => item === active || item.contains(active));

    let nextIndex = -1;
    switch (e.key) {
        case 'ArrowDown':
            nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
            break;
        case 'ArrowUp':
            nextIndex = currentIndex < 0
                ? items.length - 1
                : (currentIndex - 1 + items.length) % items.length;
            break;
        case 'Home': nextIndex = 0; break;
        case 'End':  nextIndex = items.length - 1; break;
        default: return;
    }

    e.preventDefault();
    const target = items[nextIndex];
    if (target) target.focus();
};
