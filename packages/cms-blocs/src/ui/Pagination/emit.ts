export const goto = (host: HTMLElement, currentPage: number, page: number) => {
    if (page === currentPage) return;
    const cancelled = !host.dispatchEvent(new CustomEvent('page-change', {
        bubbles: true,
        cancelable: true,
        detail: { page },
    }));
    if (cancelled) return;
    host.setAttribute('page', String(page));
};
