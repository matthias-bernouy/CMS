import type { CollectionRepositoryEntry } from "@bernouy/cms-repository/collections/sources";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
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
        const latest = new Map<string, CollectionRepositoryEntry>();
        for (const release of data.releases) {
            const key = `${release.publisherId}/${release.collectionId}`;
            const previous = latest.get(key);
            if (!previous || compareSemVer(release.version, previous.version) > 0) {
                latest.set(key, release);
            }
        }
        for (const release of latest.values()) {
            const installed = data.installed.find((item) => item.collectionId === release.collectionId);
            const upgrade = installed && compareSemVer(release.version, installed.version) > 0;
            const card = document.createElement("article");
            const title = document.createElement("h3");
            title.textContent = release.name;
            const details = document.createElement("p");
            details.textContent = `${release.publisherId} · Latest v${release.version}${installed ? ` · Installed v${installed.version}` : ""} · ${release.blocCount} blocs${release.hasTheme ? " · Theme" : ""} · ${release.repositoryId}`;
            const description = document.createElement("p");
            description.textContent = release.description;
            const actions = document.createElement("div");
            actions.className = "collection-actions";
            if (installed) {
                const manage = document.createElement("a");
                manage.href = `${getMetaBasePath()}/admin/collections/${encodeURIComponent(`installed:${release.collectionId}`)}/overview`;
                manage.textContent = "Manage";
                actions.append(manage);
            }
            if (!installed || upgrade) {
                const action = document.createElement("button");
                action.type = "button";
                action.textContent = installed ? `Upgrade to ${release.version}` : "Install collection";
                action.addEventListener("click", () => void this.install(release, action));
                actions.append(action);
            }
            card.append(title, details, description, actions);
            list.append(card);
        }
        root.querySelector("[data-empty]")!.toggleAttribute("hidden", latest.size > 0);
        root.querySelector("[data-unconfigured]")!.toggleAttribute("hidden", data.repositories.length > 0);
        root.querySelector("[data-no-releases]")!.toggleAttribute(
            "hidden",
            data.repositories.length === 0 || latest.size > 0,
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
