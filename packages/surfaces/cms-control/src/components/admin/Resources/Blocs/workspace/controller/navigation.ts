export function filterWorkspaceNavigation(menu: HTMLElement, value: string): void {
    const query = normalizeSearch(value);
    let visible = 0;
    for (const section of Array.from(menu.querySelectorAll<HTMLElement>("w13c-lateral-menu-section"))) {
        if (query && section.dataset.searchOpen === undefined) {
            section.dataset.searchOpen = String(section.hasAttribute("open"));
        }
        let matches = 0;
        let retained = 0;
        for (const item of Array.from(section.querySelectorAll<HTMLElement>("w13c-lateral-menu-item"))) {
            const match =
                !query || normalizeSearch(item.dataset.collectionNavName ?? item.textContent ?? "").includes(query);
            const retainCurrent = Boolean(query) && item.hasAttribute("active") && !match;
            item.hidden = !match && !retainCurrent;
            item.toggleAttribute("data-search-current", retainCurrent);
            matches += Number(match);
            retained += Number(retainCurrent);
        }
        section.hidden = Boolean(query) && matches === 0 && retained === 0;
        visible += matches;
        if (query) {
            section.toggleAttribute("open", matches > 0 || retained > 0);
        } else if (section.dataset.searchOpen !== undefined) {
            section.toggleAttribute("open", section.dataset.searchOpen === "true");
            delete section.dataset.searchOpen;
        }
    }
    menu.querySelector<HTMLElement>("[data-collection-nav-search-empty]")?.toggleAttribute(
        "hidden",
        !query || visible > 0,
    );
}

function normalizeSearch(value: string): string {
    return value
        .normalize("NFD")
        .replaceAll(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase();
}
