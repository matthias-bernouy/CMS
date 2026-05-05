export const handleKeydown = (host: HTMLElement, anchor: HTMLAnchorElement | null, e: KeyboardEvent) => {
    if (host.hasAttribute('disabled')) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target !== host) return;
    e.preventDefault();
    anchor?.click();
};
