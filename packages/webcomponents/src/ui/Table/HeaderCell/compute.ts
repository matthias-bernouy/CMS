export const initialFilterValue = (host: HTMLElement): string => {
    const filterName = host.getAttribute('filter-name');
    if (!filterName) return '';
    const url = new URL(window.location.href);
    return url.searchParams.get(`f_${filterName}`) ?? '';
};

export const syncFilterState = (
    host: HTMLElement,
    filterBtn: HTMLElement | null,
    input: HTMLInputElement | null,
) => {
    const filterName = host.getAttribute('filter-name');
    if (!filterBtn) return;
    if (!filterName) {
        filterBtn.setAttribute('hidden', '');
        host.removeAttribute('data-has-filter');
        return;
    }
    filterBtn.removeAttribute('hidden');
    const value = initialFilterValue(host);
    if (input) input.value = value;
    if (value) host.setAttribute('data-has-filter', '');
    else host.removeAttribute('data-has-filter');
};
