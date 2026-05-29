/**
 * Pure helpers for the page picker UI used by `<p9r-link>`.
 * Rendering and filtering live here so the custom element file stays focused
 * on fetching, state, and the public value/name API.
 */

export type PageRef = { title: string; path: string };

/** Case-insensitive match on title or path. */
export function filterPages(pages: PageRef[], query: string): PageRef[] {
    const q = query.toLowerCase();
    return pages.filter(p =>
        p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    );
}

/**
 * Rebuilds the option `<li>`s inside `listEl`. Shows/hides `emptyEl` based
 * on result count. Returns the freshly created option elements so the caller
 * can toggle `.selected` on them when the active value changes.
 */
export function buildOptionList(
    listEl: HTMLElement,
    emptyEl: HTMLElement,
    pages: PageRef[],
    onSelect: (page: PageRef) => void,
): HTMLElement[] {
    listEl.innerHTML = "";

    if (pages.length === 0) {
        emptyEl.style.display = "block";
        return [];
    }
    emptyEl.style.display = "none";

    const options: HTMLElement[] = [];
    for (const page of pages) {
        const li = document.createElement("li");
        li.className = "option";
        li.dataset.value = page.path;

        const title = document.createElement("span");
        title.className = "option-title";
        title.textContent = page.title;

        const path = document.createElement("span");
        path.className = "option-path";
        path.textContent = page.path;

        li.append(title, path);
        li.addEventListener("click", () => onSelect(page));

        listEl.appendChild(li);
        options.push(li);
    }
    return options;
}
