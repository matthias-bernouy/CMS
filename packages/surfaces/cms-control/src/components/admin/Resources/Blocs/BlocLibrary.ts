import { Component } from "@bernouy/components/base";
import { LibraryOperations } from "./actions/operations";
import { currentRoute, interceptLink, libraryUrl, LIBRARY_ROUTE_EVENT, navigate } from "./data/route";
import { BlocWorkspace } from "./Workspace";
import base from "./view/styles/base.css" with { type: "text" };
import collections from "./view/styles/collections.css" with { type: "text" };
import blocks from "./view/styles/blocks.css" with { type: "text" };
import dialogs from "./view/styles/dialogs.css" with { type: "text" };
import responsive from "./view/styles/responsive.css" with { type: "text" };

export class BlocLibrary extends Component {
    private workspace: BlocWorkspace;
    private operations: LibraryOperations;
    private searchTimer?: ReturnType<typeof setTimeout>;

    constructor() {
        super({
            css: [base, collections, blocks, dialogs, responsive].join("\n"),
            template:
                '<div class="library"><div data-status class="status" role="status" aria-live="polite"></div><div data-content><p>Loading collections…</p></div><div data-save-bar></div></div><dialog></dialog>',
        });
        this.workspace = new BlocWorkspace(this.shadowRoot!);
        this.operations = new LibraryOperations(this.workspace);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot!.addEventListener("click", this.handleClick);
        this.shadowRoot!.addEventListener("input", this.input);
        this.shadowRoot!.addEventListener("change", this.change);
        this.shadowRoot!.querySelector("dialog")!.addEventListener("close", this.closedDialog);
        window.addEventListener(LIBRARY_ROUTE_EVENT, this.routeChanged);
        window.addEventListener("popstate", this.routeChanged);
        this.routeChanged();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("input", this.input);
        this.shadowRoot?.removeEventListener("change", this.change);
        this.shadowRoot?.querySelector("dialog")?.removeEventListener("close", this.closedDialog);
        window.removeEventListener(LIBRARY_ROUTE_EVENT, this.routeChanged);
        window.removeEventListener("popstate", this.routeChanged);
        clearTimeout(this.searchTimer);
        this.workspace.dispose();
    }

    private routeChanged = (): void => {
        clearTimeout(this.searchTimer);
        if (!currentRoute().bloc) {
            this.shadowRoot!.querySelector("dialog")!.close();
        }
        void this.workspace.load();
    };

    private closedDialog = (): void => {
        if (this.shadowRoot!.querySelector("dialog")!.open) {
            return;
        }
        const route = currentRoute();
        if (route.bloc) {
            history.replaceState(null, "", libraryUrl({ ...route, bloc: "" }));
        }
    };

    private handleClick = (event: Event): void => {
        const target = event.target as Element;
        const link = target.closest<HTMLAnchorElement>("a[data-collection-link]");
        if (link && interceptLink(event)) {
            event.preventDefault();
            navigate({ collection: link.dataset.collectionLink });
            return;
        }
        const action = target.closest<HTMLElement>("[data-action]");
        if (action) {
            void this.operations
                .perform(action.dataset.action!, action)
                .catch((error) => this.workspace.notice(String(error), true));
        }
    };

    private input = (event: Event): void => {
        const input = event.target as HTMLInputElement;
        if (!input.matches("[data-search]")) {
            return;
        }
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.workspace.search(input.value), 180);
    };

    private change = (event: Event): void => {
        const input = event.target as HTMLInputElement;
        if (input.dataset.filter === "group" || input.dataset.filter === "state") {
            this.workspace.filters[input.dataset.filter] = input.value;
            this.workspace.filters.limit = 24;
            this.workspace.render();
        } else if (input.dataset.resource && this.workspace.detail && !this.workspace.busy) {
            this.workspace.drafts.toggle(this.workspace.detail, input.dataset.resource, input.checked);
            if (this.workspace.filters.state) {
                this.workspace.render();
            } else {
                this.workspace.renderAvailability();
            }
        }
    };
}

customElements.define("cms-bloc-library", BlocLibrary);
