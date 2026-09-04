export class DiscoveryController {
    activeResult = -1;
    entries = [];
    headings = [];
    host = null;
    input = null;
    observer = null;
    results = null;
    sidebarSlot = null;

    constructor(host) {
        this.host = host;
        this.input = host.shadowRoot?.querySelector(".search-input") ?? null;
        this.results = host.shadowRoot?.querySelector(".search-results") ?? null;
        this.sidebarSlot = host.shadowRoot?.querySelector('slot[name="sidebar"]') ?? null;
        this.observer = new MutationObserver(this.scheduleRefresh);
    }

    connect() {
        this.input?.addEventListener("input", this.renderResults);
        this.input?.addEventListener("focus", this.renderResults);
        this.input?.addEventListener("keydown", this.onSearchKeydown);
        this.sidebarSlot?.addEventListener("slotchange", this.scheduleRefresh);
        document.addEventListener("keydown", this.onShortcut);
        document.addEventListener("click", this.onDocumentClick);
        this.observer.observe(this.host, { childList: true, subtree: true, characterData: true });
        this.refresh();
    }

    disconnect() {
        this.input?.removeEventListener("input", this.renderResults);
        this.input?.removeEventListener("focus", this.renderResults);
        this.input?.removeEventListener("keydown", this.onSearchKeydown);
        this.sidebarSlot?.removeEventListener("slotchange", this.scheduleRefresh);
        document.removeEventListener("keydown", this.onShortcut);
        document.removeEventListener("click", this.onDocumentClick);
        this.observer.disconnect();
    }

    scheduleRefresh = () => {
        requestAnimationFrame(() => this.refresh());
    };

    refresh() {
        const currentPath = this.normalize(location.pathname);
        const anchors = [...this.host.querySelectorAll('[slot="sidebar"] a[href]')];
        this.entries = anchors.map((anchor) => ({
            href: anchor.href,
            label: anchor.textContent?.trim() || anchor.pathname,
            section:
                anchor.closest("doc-sidebar-section")?.querySelector('[slot="title"]')?.textContent?.trim() ||
                "Documentation",
        }));
        for (const anchor of anchors) {
            const active = this.normalize(anchor.pathname) === currentPath;
            if (active) {
                anchor.setAttribute("aria-current", "page");
            } else {
                anchor.removeAttribute("aria-current");
            }
            anchor.closest("doc-sidebar-link")?.toggleAttribute("active", active);
        }
        const current = this.entries.find((entry) => this.normalize(new URL(entry.href).pathname) === currentPath);
        this.renderBreadcrumbs(current);
        this.renderToc();
    }

    renderBreadcrumbs(current) {
        const container = this.host.shadowRoot?.querySelector(".breadcrumbs");
        if (!container) {
            return;
        }
        container.replaceChildren();
        const home = document.createElement("a");
        home.href = "/";
        home.textContent = "Docs";
        container.append(home);
        if (current?.section && current.section !== "Introduction") {
            container.append(
                this.separator(),
                Object.assign(document.createElement("span"), { textContent: current.section }),
            );
        }
        if (current && this.normalize(location.pathname) !== "/") {
            container.append(
                this.separator(),
                Object.assign(document.createElement("span"), { textContent: current.label }),
            );
        }
    }

    renderToc() {
        this.headings = [...this.host.querySelectorAll("h2, h3, doc-anchor-heading")].filter(
            (heading) => !heading.closest('[slot="sidebar"]'),
        );
        const usedIds = new Set();
        for (const [index, heading] of this.headings.entries()) {
            const base =
                heading.id || this.slug(heading.textContent || `section-${index + 1}`) || `section-${index + 1}`;
            let id = base;
            let suffix = 2;
            while (usedIds.has(id)) {
                id = `${base}-${suffix}`;
                suffix += 1;
            }
            heading.id = id;
            usedIds.add(id);
        }
        const lists = [
            this.host.shadowRoot?.querySelector(".on-page-list"),
            this.host.shadowRoot?.querySelector(".mobile-toc-list"),
        ];
        for (const list of lists) {
            list?.replaceChildren(...this.headings.map((heading, index) => this.tocItem(heading, index)));
        }
        this.host.toggleAttribute("has-toc", this.headings.length > 0);
        const count = this.host.shadowRoot?.querySelector(".toc-count");
        if (count) {
            count.textContent = `${this.headings.length} sections`;
        }
    }

    tocItem(heading, index) {
        const item = document.createElement("li");
        item.className = heading.matches("h3") ? "nested" : "";
        const link = document.createElement("a");
        link.href = `#${heading.id}`;
        link.textContent = heading.textContent?.trim() || `Section ${index + 1}`;
        item.append(link);
        return item;
    }

    renderResults = () => {
        if (!this.results || !this.input) {
            return;
        }
        const query = this.input.value.trim().toLocaleLowerCase();
        const matches = this.entries
            .filter((entry) => `${entry.label} ${entry.section}`.toLocaleLowerCase().includes(query))
            .slice(0, 8);
        this.activeResult = -1;
        this.results.replaceChildren(...matches.map((entry, index) => this.resultItem(entry, index)));
        this.results.toggleAttribute("data-empty", matches.length === 0);
        this.results.toggleAttribute("data-open", true);
        this.input.setAttribute("aria-expanded", "true");
    };

    resultItem(entry, index) {
        const link = document.createElement("a");
        link.href = entry.href;
        link.id = `documentation-search-result-${index}`;
        link.role = "option";
        const label = document.createElement("strong");
        label.textContent = entry.label;
        const section = document.createElement("span");
        section.textContent = entry.section;
        link.append(label, section);
        return link;
    }

    onSearchKeydown = (event) => {
        const options = [...(this.results?.querySelectorAll('a[role="option"]') ?? [])];
        if (event.key === "Escape") {
            this.closeResults();
            this.input?.blur();
            return;
        }
        if (event.key === "Enter" && this.activeResult >= 0) {
            options[this.activeResult]?.click();
            return;
        }
        if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || options.length === 0) {
            return;
        }
        event.preventDefault();
        if (this.activeResult < 0) {
            this.activeResult = event.key === "ArrowDown" ? 0 : options.length - 1;
        } else {
            this.activeResult =
                (this.activeResult + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        }
        options.forEach((option, index) => option.setAttribute("aria-selected", String(index === this.activeResult)));
        this.input?.setAttribute("aria-activedescendant", options[this.activeResult]?.id ?? "");
    };

    onShortcut = (event) => {
        const target = event.target;
        const typing = target?.matches("input, textarea, select, [contenteditable=true]");
        const command = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
        if (command || (event.key === "/" && !typing)) {
            event.preventDefault();
            this.input?.focus();
        }
    };

    onDocumentClick = (event) => {
        const insideSearch = event
            .composedPath()
            .some((node) => node instanceof HTMLElement && node.classList.contains("search-wrap"));
        if (!insideSearch) {
            this.closeResults();
        }
    };

    closeResults() {
        this.results?.removeAttribute("data-open");
        this.input?.setAttribute("aria-expanded", "false");
        this.input?.removeAttribute("aria-activedescendant");
    }

    normalize(path) {
        return path.replace(/\/+$/, "") || "/";
    }

    separator() {
        return document.createTextNode("/");
    }

    slug(value) {
        return value
            .toLocaleLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }
}
