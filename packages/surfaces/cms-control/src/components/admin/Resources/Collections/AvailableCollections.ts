import type { CollectionRepositoryEntry } from "@bernouy/cms-repository/collections/sources";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { collectionCatalogueItems, renderCollectionCatalogue, type InstalledCollectionSummary } from "./catalogue";
import { collectionRequest } from "./client";
import template from "./available.html" with { type: "text" };
import css from "./available.css" with { type: "text" };

type Catalogue = {
    repositories: string[];
    releases: CollectionRepositoryEntry[];
    revision: number;
    installed: InstalledCollectionSummary[];
};

export class AvailableCollections extends HTMLElement {
    private catalogue?: Catalogue;

    connectedCallback(): void {
        if (this.shadowRoot) {
            return;
        }
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>${css}</style>${template}`;
        root.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        root.querySelector("[data-search]")!.addEventListener("input", () => this.render());
        void this.load();
    }

    private async load(): Promise<void> {
        this.showState("loading");
        try {
            this.catalogue = (await collectionRequest("available")) as Catalogue;
            this.render();
            this.showState("ready");
        } catch (error) {
            this.shadowRoot!.querySelector("[data-view-error-message]")!.textContent =
                error instanceof Error ? error.message : "Collections could not be loaded.";
            this.showState("error");
        }
    }

    private showState(state: "loading" | "error" | "ready"): void {
        const root = this.shadowRoot!;
        root.querySelector<HTMLElement>("[data-view-loading]")!.hidden = state !== "loading";
        root.querySelector<HTMLElement>("[data-view-error]")!.hidden = state !== "error";
        root.querySelector<HTMLElement>("[data-view-content]")!.hidden = state !== "ready";
        this.setAttribute("aria-busy", String(state === "loading"));
    }

    private render(): void {
        if (!this.catalogue) {
            return;
        }
        const root = this.shadowRoot!;
        const query = root.querySelector<HTMLInputElement>("[data-search]")!.value.trim().toLowerCase();
        const items = collectionCatalogueItems(this.catalogue.releases, this.catalogue.installed, query);
        renderCollectionCatalogue(root.querySelector("[data-list]")!, items, (release, button) =>
            this.install(release, button),
        );
        root.querySelector("[data-empty]")!.toggleAttribute("hidden", items.length > 0);
        root.querySelector("[data-unconfigured]")!.toggleAttribute("hidden", this.catalogue.repositories.length > 0);
        root.querySelector("[data-no-releases]")!.toggleAttribute(
            "hidden",
            this.catalogue.repositories.length === 0 || this.catalogue.releases.length > 0,
        );
        root.querySelector("[data-no-results]")!.toggleAttribute(
            "hidden",
            !query || this.catalogue.releases.length === 0 || items.length > 0,
        );
    }

    private async install(release: CollectionRepositoryEntry, button: HTMLButtonElement): Promise<void> {
        button.disabled = true;
        try {
            const result = await collectionRequest("install", {
                repositoryId: release.repositoryId,
                publisherId: release.publisherId,
                collectionId: release.collectionId,
                version: release.version,
                digest: release.digest,
                revision: this.catalogue!.revision,
            });
            location.href = `${getMetaBasePath()}/admin/collections/${encodeURIComponent(`installed:${result.collectionId}`)}/overview`;
        } catch (error) {
            this.shadowRoot!.querySelector("[role=status]")!.textContent = String(error);
            button.disabled = false;
        }
    }
}

customElements.define("cms-available-collections", AvailableCollections);
