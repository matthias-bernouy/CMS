export const applySortNavigation = (host: HTMLElement) => {
    const sortKey = host.getAttribute("sort");
    if (!sortKey) {
        return;
    }
    const url = new URL(window.location.href);
    const currentSort = url.searchParams.get("sort");
    const currentDir = url.searchParams.get("direction");
    const newDir = currentSort === sortKey && currentDir === "asc" ? "desc" : "asc";
    url.searchParams.set("sort", sortKey);
    url.searchParams.set("direction", newDir);
    window.location.href = url.toString();
};

export const applyFilterNavigation = (host: HTMLElement, value: string) => {
    const filterName = host.getAttribute("filter-name");
    if (!filterName) {
        return;
    }
    const url = new URL(window.location.href);
    if (value) {
        url.searchParams.set(`f_${filterName}`, value);
    } else {
        url.searchParams.delete(`f_${filterName}`);
    }
    window.location.href = url.toString();
};
