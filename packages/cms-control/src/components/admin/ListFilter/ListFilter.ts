/**
 * `<cms-list-filter tags-url="…">` — wraps a filter bar + a `<cms-fetch>` list +
 * sortable headers, and rebuilds the cms-fetch `url` query string on any change.
 * The SERVER does the actual filtering/sorting (see `getPagesList`); this only
 * translates UI state into query params. cms-fetch observes `url` and reloads.
 *
 * Everything lives in this element's light DOM:
 *   - target list:  the first descendant `<cms-fetch>` — its initial `url`
 *                   (query stripped) is the base endpoint.
 *   - search:   `[data-filter="search"]`  (input)  — debounced
 *   - visible:  `[data-filter="visible"]` (select)
 *   - tag:      `[data-filter="tag"]`     (select) — options filled from `tags-url`
 *   - sorting:  `[data-sort="title|path|visible"]` (clickable header) — toggles
 *               asc/desc; the active column shows ↑/↓ in its `[data-sort-ind]` span.
 */
class CmsListFilter extends HTMLElement {

    private _fetch: Element | null = null;
    private _base = "";
    private _filters: Record<string, string> = {};
    private _sortBy = "";
    private _sortOrder: "asc" | "desc" = "asc";
    private _debounce: ReturnType<typeof setTimeout> | null = null;

    connectedCallback() { requestAnimationFrame(() => this._init()); }

    private _init() {
        this._fetch = this.querySelector("cms-fetch");
        if (!this._fetch) return;
        this._base = (this._fetch.getAttribute("url") || "").split("?")[0]!;

        // Default sort mirrors the server (title asc) — show it without forcing
        // an extra refetch (the initial cms-fetch already loads that order).
        this._sortBy = this.getAttribute("default-sort") || "title";
        this._renderSortIndicators();

        this._wireFilters();
        this._wireSort();
        void this._loadTags();
    }

    private _wireFilters() {
        const search = this.querySelector('[data-filter="search"]');
        search?.addEventListener("input", () => {
            if (this._debounce) clearTimeout(this._debounce);
            this._debounce = setTimeout(() => this._set("search", val(search)), 250);
        });
        for (const key of ["visible", "tag"]) {
            const el = this.querySelector(`[data-filter="${key}"]`);
            el?.addEventListener("change", () => this._set(key, val(el)));
        }
    }

    private _wireSort() {
        this.querySelectorAll<HTMLElement>("[data-sort]").forEach(h => {
            h.style.cursor = "pointer";
            h.addEventListener("click", () => {
                const key = h.dataset.sort!;
                if (this._sortBy === key) this._sortOrder = this._sortOrder === "asc" ? "desc" : "asc";
                else { this._sortBy = key; this._sortOrder = "asc"; }
                this._renderSortIndicators();
                this._apply();
            });
        });
    }

    private _renderSortIndicators() {
        this.querySelectorAll<HTMLElement>("[data-sort]").forEach(h => {
            const ind = h.querySelector("[data-sort-ind]");
            if (ind) ind.textContent = h.dataset.sort === this._sortBy ? (this._sortOrder === "asc" ? "↑" : "↓") : "";
        });
    }

    private _set(key: string, value: string) {
        if (value) this._filters[key] = value; else delete this._filters[key];
        this._apply();
    }

    private _apply() {
        if (!this._fetch) return;
        const params = new URLSearchParams(this._filters);
        if (this._sortBy) { params.set("sortBy", this._sortBy); params.set("sortOrder", this._sortOrder); }
        const qs = params.toString();
        this._fetch.setAttribute("url", qs ? `${this._base}?${qs}` : this._base);
    }

    private async _loadTags() {
        const url = this.getAttribute("tags-url");
        const sel = this.querySelector('[data-filter="tag"]');
        if (!url || !sel) return;
        try {
            const tags = await (await fetch(url)).json() as { value: string; count: number }[];
            for (const t of tags) {
                const opt = document.createElement("option");
                opt.value = t.value;
                opt.textContent = `${t.value} (${t.count})`;
                sel.appendChild(opt);   // p9r-select picks this up via slotchange
            }
        } catch { /* leave the tag filter with just its static option */ }
    }
}

const val = (el: Element): string => (el as HTMLInputElement).value ?? "";

if (!customElements.get("cms-list-filter")) {
    customElements.define("cms-list-filter", CmsListFilter);
}
