import { Component } from "@bernouy/components/base";
import { loadLibrary, LIBRARY_DATA_EVENT } from "../data/store";
import { currentRoute, navigate, libraryUrl, LIBRARY_ROUTE_EVENT, interceptLink } from "../data/route";
import type { LibraryData } from "../data/model";
import { element, icon } from "../view/dom";
import css from "./nav.css" with { type: "text" };

export class BlocCollectionsNav extends Component {
    private data?: LibraryData;
    constructor() {
        super({ css, template: '<nav aria-label="Bloc collections"></nav>' });
    }
    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot!.addEventListener("click", this.handleClick);
        window.addEventListener(LIBRARY_DATA_EVENT, this.changed);
        window.addEventListener(LIBRARY_ROUTE_EVENT, this.render);
        window.addEventListener("popstate", this.render);
        this.render();
        void loadLibrary()
            .then((data) => {
                this.data = data;
                this.render();
            })
            .catch(() => {
                this.shadowRoot!.querySelector("nav")?.append(element("p", "hint", "Collections could not be loaded."));
            });
    }
    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        window.removeEventListener(LIBRARY_DATA_EVENT, this.changed);
        window.removeEventListener(LIBRARY_ROUTE_EVENT, this.render);
        window.removeEventListener("popstate", this.render);
    }
    private changed = (event: Event): void => {
        this.data = (event as CustomEvent<LibraryData>).detail;
        this.render();
    };
    private render = (): void => {
        const root = this.shadowRoot!.querySelector("nav")!;
        const route = currentRoute();
        const title = element("div", "nav-heading", "Collections");
        const add = element("a", "add-collection", "Add collection");
        add.prepend(icon("plus"));
        add.href = libraryUrl({ view: "add" });
        add.dataset.nav = "add";
        if (route.view === "add") {
            add.setAttribute("aria-current", "page");
        }
        const all = this.link("All collections", "", route.view === "library");
        all.prepend(icon());
        root.replaceChildren(title, add, all);
        for (const [kind, label] of [
            ["site", "Created in this site"],
            ["managed", "Managed collections"],
            ["code", "From code"],
        ]) {
            const collections = this.data?.collections.filter((item) => item.kind === kind) ?? [];
            if (!collections.length) {
                continue;
            }
            const group = element("section", "nav-group");
            group.append(element("h2", "", label));
            for (const collection of collections) {
                const link = this.link(
                    collection.name,
                    collection.key,
                    route.view === "collection" && route.collection === collection.key,
                );
                link.prepend(
                    element("span", `collection-mark ${collection.kind}`, collection.name.slice(0, 1).toUpperCase()),
                );
                link.append(element("small", "count", String(collection.blocs.length)));
                group.append(link);
            }
            root.append(group);
        }
    };
    private link(label: string, key: string, active: boolean): HTMLAnchorElement {
        const link = element("a", "nav-item");
        link.append(element("span", "nav-label", label));
        link.href = libraryUrl({ collection: key });
        link.dataset.nav = key;
        if (active) {
            link.setAttribute("aria-current", "page");
        }
        return link;
    }
    private handleClick = (event: Event): void => {
        const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-nav]");
        if (!link || !interceptLink(event)) {
            return;
        }
        event.preventDefault();
        navigate(link.dataset.nav === "add" ? { view: "add" } : { collection: link.dataset.nav });
    };
}

customElements.define("cms-bloc-collections-nav", BlocCollectionsNav);
