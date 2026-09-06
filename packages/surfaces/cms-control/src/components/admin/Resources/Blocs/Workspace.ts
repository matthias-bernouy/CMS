import { getIntegrationInstallation } from "../Integrations/api";
import { AvailabilityDrafts } from "./actions/availability";
import { availableCollections } from "./data/api";
import type { AvailableCollection, BlocCollection, LibraryData, ManagedDetail } from "./data/model";
import { currentRoute, libraryUrl } from "./data/route";
import { loadLibrary } from "./data/store";
import { type BlocFilters, renderCollection } from "./view/blocks";
import { renderAdd, renderLibrary } from "./view/collections";
import { showBlocDetails } from "./view/details";
import { button, empty } from "./view/dom";
import { PreviewObservers } from "./view/previews";
import { renderSaveBar } from "./view/saveBar";

export class BlocWorkspace {
    data?: LibraryData;
    collection?: BlocCollection;
    detail?: ManagedDetail;
    readonly drafts = new AvailabilityDrafts();
    filters: BlocFilters = { query: "", group: "", state: "", limit: 24 };
    busy = false;
    private available?: AvailableCollection[];
    private details = new Map<string, ManagedDetail>();
    private generation = 0;
    private previews = new PreviewObservers();

    constructor(readonly root: ShadowRoot) {}

    get availability() {
        return this.detail ? this.drafts.get(this.detail) : undefined;
    }

    async load(refresh = false): Promise<void> {
        const generation = ++this.generation;
        const route = currentRoute();
        if (this.collection?.key !== route.collection) {
            this.filters = { query: route.query, group: "", state: "", limit: 24 };
        } else {
            this.filters.query = route.query;
        }
        if (refresh) {
            this.details.clear();
            this.available = undefined;
        }
        try {
            const data = await loadLibrary(refresh);
            if (generation !== this.generation) {
                return;
            }
            this.data = data;
            this.collection = data.collections.find((item) => item.key === route.collection);
            this.detail = undefined;
            if (route.view === "add") {
                this.available ??= await availableCollections();
            }
            const id = this.collection?.installation?.id;
            if (route.view === "collection" && id) {
                let detail = this.details.get(id);
                if (!detail) {
                    const result = await getIntegrationInstallation(id);
                    if (
                        result.definition?.schema === "cms.integration.definition.v2" &&
                        result.definition.type === "collection"
                    ) {
                        detail = result as ManagedDetail;
                        this.details.set(id, detail);
                    }
                }
                if (generation !== this.generation) {
                    return;
                }
                this.detail = detail;
            }
            if (generation === this.generation) {
                this.render();
            }
        } catch (error) {
            if (generation !== this.generation) {
                return;
            }
            const failure = empty(
                "The collection library could not be loaded",
                error instanceof Error ? error.message : "Please try again.",
            );
            failure.append(button("Try again", "retry"));
            this.root.querySelector("[data-content]")!.replaceChildren(failure);
        }
    }

    render(): void {
        if (!this.data) {
            return;
        }
        const route = currentRoute();
        const searchFocused = this.root.activeElement?.matches("[data-search]");
        const content =
            route.view === "add"
                ? renderAdd(this.available ?? [], this.data)
                : route.view === "library"
                  ? renderLibrary(this.data, route.query)
                  : this.collection
                    ? renderCollection(this.collection, this.filters, this.availability)
                    : empty("Collection not found", "Choose a collection from the navigation to continue.");
        this.root.querySelector("[data-content]")!.replaceChildren(content);
        this.previews.observe(this.root);
        this.renderAvailability();
        if (searchFocused) {
            this.root.querySelector<HTMLInputElement>("[data-search]")?.focus();
        }
        if (route.bloc && this.collection) {
            const bloc = this.collection.blocs.find((item) => item.tag === route.bloc);
            if (bloc) {
                showBlocDetails(this.root, bloc, this.collection);
            }
        }
    }

    renderAvailability(): void {
        renderSaveBar(this.root, this.availability, this.busy);
        for (const input of Array.from(this.root.querySelectorAll<HTMLInputElement>("[data-resource]"))) {
            input.disabled = this.busy;
            input.checked = this.availability?.selected.has(input.dataset.resource!) ?? false;
            input.previousElementSibling!.textContent = input.checked ? "Available" : "Hidden";
        }
    }

    notice(message: string, error = false): void {
        const status = this.root.querySelector<HTMLElement>("[data-status]")!;
        status.textContent = message;
        status.className = error ? "status error" : "status";
    }

    search(query: string): void {
        this.filters.query = query;
        this.filters.limit = 24;
        history.replaceState(null, "", libraryUrl({ ...currentRoute(), query, bloc: "" }));
        this.render();
    }

    dispose(): void {
        this.generation++;
        this.previews.disconnect();
    }
}
