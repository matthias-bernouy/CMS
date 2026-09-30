import type { CollectionRepositoryEntry } from "@bernouy/cms-repository/collections/sources";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import { collectionRequest } from "./client";
import template from "./available.html" with { type: "text" };
import css from "./available.css" with { type: "text" };

type Installed = { collectionId: string; digest: string; version: string };
type Catalogue = {
    repositories: string[];
    releases: CollectionRepositoryEntry[];
    revision: number;
    installed: Installed[];
};

export class AvailableCollections extends HTMLElement {
    private catalogue?: Catalogue;
    connectedCallback() {
        if (this.shadowRoot) {
            return;
        }
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>${css}</style>${template}`;
        void this.load();
    }
    private async load() {
        try {
            this.catalogue = (await collectionRequest("available")) as Catalogue;
            this.render();
        } catch (error) {
            this.shadowRoot!.querySelector("[role=status]")!.textContent = String(error);
        }
    }
    private render() {
        const root = this.shadowRoot!;
        const data = this.catalogue!;
        const list = root.querySelector("[data-list]")!;
        list.replaceChildren();
        for (const release of data.releases) {
            const installed = data.installed.find((item) => item.collectionId === release.collectionId);
            const card = document.createElement("article");
            const title = document.createElement("h3");
            title.textContent = release.name;
            const details = document.createElement("p");
            details.textContent = `${release.publisherId} · ${release.version} · ${release.blocCount} blocs${release.hasTheme ? " · Theme" : ""} · ${release.repositoryId}`;
            const description = document.createElement("p");
            description.textContent = release.description;
            const action = document.createElement("button");
            action.type = "button";
            action.textContent =
                installed?.digest === release.digest
                    ? "Installed"
                    : installed
                      ? "Update collection"
                      : "Install collection";
            action.disabled = installed?.digest === release.digest;
            action.addEventListener("click", () => void this.install(release, action));
            card.append(title, details, description, action);
            list.append(card);
        }
        root.querySelector("[data-empty]")!.toggleAttribute("hidden", data.releases.length > 0);
        root.querySelector("[data-unconfigured]")!.toggleAttribute("hidden", data.repositories.length > 0);
        root.querySelector("[data-no-releases]")!.toggleAttribute(
            "hidden",
            data.repositories.length === 0 || data.releases.length > 0,
        );
    }
    private async install(release: CollectionRepositoryEntry, button: HTMLButtonElement) {
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
