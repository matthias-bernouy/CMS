import { navigateRow } from './emit';

export const handleClick = (host: HTMLElement) => {
    if (!host.hasAttribute('href')) return;
    navigateRow(host);
};

export const handleKeydown = (host: HTMLElement, e: KeyboardEvent) => {
    if (!host.hasAttribute('href')) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateRow(host);
    }
};
