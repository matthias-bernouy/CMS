import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import "./Management/ProviderManagement";
import type { ProviderManagement } from "./Management/ProviderManagement";
import { bindCustomProviderFlow } from "./Custom/controller";
import { renderCustomProviders } from "./Custom/rows";
import {
    type ImportedProvider,
    type ProviderCatalogueData,
    type ProviderInstallation,
    renderProviderConnections,
    renderProviderManifests,
} from "./rows";
import { renderProviderDetail } from "./detail";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type ModalControl = HTMLElement & { showModal(): void; hide(): void };

export class ProviderCatalogue extends HTMLElement {
    private catalogue: ProviderCatalogueData = { repositories: [], available: [], imported: [] };
    private installations: ProviderInstallation[] = [];

    connectedCallback(): void {
        if (this.shadowRoot) {
            return;
        }
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>${css}</style>${template}`;
        root.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        root.querySelector("[data-back]")!.setAttribute("href", location.pathname);
        root.querySelector("[data-source-link]")!.setAttribute("href", `${getMetaBasePath()}/admin/sources`);
        root.querySelector("[data-provider-reconnect]")!.addEventListener("click", () => void this.reconnectActive());
        root.querySelector("cms-provider-management")!.addEventListener("provider-connection-opened", () => {
            this.connectModal().showModal();
        });
        root.querySelector("cms-provider-management")!.addEventListener("provider-connected", (event) => {
            const id = (event as CustomEvent<{ installationId: string }>).detail.installationId;
            this.connectModal().hide();
            location.href = `${location.pathname}?provider=${encodeURIComponent(id)}`;
        });
        bindCustomProviderFlow(root, (provider) => {
            void this.load().then(() =>
                this.management().open(provider.id, provider.version, provider.defaultOrigin ?? "", provider.links),
            );
        });
        void this.load();
    }

    private async load(): Promise<void> {
        this.showState("loading");
        try {
            const [catalogue, installations] = await Promise.all([
                fetch(`${getMetaBasePath()}/api/provider-catalogue`, { cache: "no-store" }),
                fetch(`${getMetaBasePath()}/api/provider-installations`, { cache: "no-store" }),
            ]);
            if (!catalogue.ok || !installations.ok) {
                throw new Error("Provider connections could not be loaded");
            }
            this.catalogue = (await catalogue.json()) as ProviderCatalogueData;
            this.installations = (
                (await installations.json()) as { installations: ProviderInstallation[] }
            ).installations;
            this.render();
            this.showState("ready");
            this.status("");
        } catch (error) {
            this.shadowRoot!.querySelector("[data-view-error-message]")!.textContent =
                error instanceof Error ? error.message : "Provider connections could not be loaded.";
            this.showState("error");
        }
    }

    private showState(state: "loading" | "error" | "ready"): void {
        const root = this.shadowRoot!;
        root.querySelector<HTMLElement>("[data-view-loading]")!.hidden = state !== "loading";
        root.querySelector<HTMLElement>("[data-view-error]")!.hidden = state !== "error";
        if (state !== "ready") {
            root.querySelector<HTMLElement>("[data-overview]")!.hidden = true;
            root.querySelector<HTMLElement>("[data-detail]")!.hidden = true;
        }
        this.setAttribute("aria-busy", String(state === "loading"));
    }

    private render(): void {
        const root = this.shadowRoot!;
        const active = new URLSearchParams(location.search).get("provider");
        root.querySelector("[data-overview]")!.toggleAttribute("hidden", Boolean(active));
        root.querySelector("[data-detail]")!.toggleAttribute("hidden", !active);
        this.renderAvailable();
        if (active) {
            this.renderDetail(active);
        } else {
            this.renderConnections();
        }
    }

    private renderDetail(id: string): void {
        const item = this.installations.find((installation) => installation.id === id);
        renderProviderDetail(this.shadowRoot!, item, this.catalogue);
    }

    private async reconnectActive(): Promise<void> {
        const id = new URLSearchParams(location.search).get("provider");
        const installation = this.installations.find((item) => item.id === id);
        if (!installation) {
            this.status("Provider connection is unavailable.");
            return;
        }
        const entry = this.catalogue.available
            .filter((item) => item.kind === "provider-manifest" && item.id === installation.providerId)
            .sort((left, right) => compareSemVer(right.version, left.version))[0];
        let manifest = entry
            ? this.catalogue.imported.find(
                  (item) => item.id === entry.id && item.version === entry.version && item.digest === entry.digest,
              )
            : undefined;
        if (entry && !manifest) {
            const button = this.shadowRoot!.querySelector<HTMLElement>("[data-provider-reconnect]")!;
            button.setAttribute("disabled", "");
            try {
                manifest = await this.importManifest(entry);
            } catch (error) {
                this.status(String(error));
                button.removeAttribute("disabled");
                return;
            }
        }
        manifest ??= this.catalogue.imported
            .filter((item) => item.id === installation.providerId)
            .sort((left, right) => compareSemVer(right.version, left.version))[0];
        if (!manifest) {
            this.status("Import a provider manifest before reconnecting this account.");
            return;
        }
        this.management().open(manifest.id, manifest.version, installation.endpoint, manifest.links, {
            installationId: installation.id,
            revision: installation.revision,
        });
    }

    private renderAvailable(): void {
        const root = this.shadowRoot!;
        const list = root.querySelector('[data-list="provider-manifest"]')!;
        const count = renderProviderManifests(list, this.catalogue, this.installations, (entry, imported, row) =>
            this.selectProvider(entry, imported, row),
        );
        list.toggleAttribute("hidden", count === 0);
        root.querySelector('[data-empty="provider-manifest"]')!.toggleAttribute(
            "hidden",
            count > 0 || this.catalogue.repositories.length === 0,
        );
        root.querySelector('[data-unconfigured="provider-manifest"]')!.toggleAttribute(
            "hidden",
            this.catalogue.repositories.length > 0,
        );
        const custom = root.querySelector("[data-custom-providers]")!;
        const customCount = renderCustomProviders(custom, this.catalogue, this.installations, (provider) =>
            this.management().open(provider.id, provider.version, provider.defaultOrigin ?? "", provider.links),
        );
        root.querySelector("[data-custom-section]")!.toggleAttribute("hidden", customCount === 0);
    }

    private renderConnections(): void {
        const list = this.shadowRoot!.querySelector("[data-connections]")!;
        renderProviderConnections(list, this.installations, this.catalogue.available);
        list.toggleAttribute("hidden", this.installations.length === 0);
        this.shadowRoot!.querySelector('[data-empty="connections"]')!.toggleAttribute(
            "hidden",
            this.installations.length > 0,
        );
    }

    private selectProvider(entry: RepositoryArtifactEntry, imported: ImportedProvider | undefined, row: HTMLElement) {
        if (row.hasAttribute("disabled")) {
            return;
        }
        if (imported) {
            this.management().open(entry.id, entry.version, imported.defaultOrigin ?? "", imported.links);
        } else {
            void this.import(entry, row);
        }
    }

    private async import(entry: RepositoryArtifactEntry, row: HTMLElement): Promise<void> {
        row.setAttribute("disabled", "");
        this.status("Importing manifest…");
        try {
            const imported = await this.importManifest(entry);
            this.management().open(entry.id, entry.version, imported.defaultOrigin ?? "", imported.links);
        } catch (error) {
            this.status(String(error));
            row.removeAttribute("disabled");
        }
    }

    private async importManifest(entry: RepositoryArtifactEntry): Promise<ImportedProvider> {
        const response = await fetch(`${getMetaBasePath()}/api/provider-import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                repositoryId: entry.repositoryId,
                kind: entry.kind,
                publisherId: entry.publisherId,
                id: entry.id,
                version: entry.version,
                digest: entry.digest,
            }),
        });
        if (!response.ok) {
            throw new Error(`Manifest import failed (${response.status}): ${await response.text()}`);
        }
        await this.load();
        const imported = this.catalogue.imported.find(
            (item) =>
                item.kind === entry.kind &&
                item.id === entry.id &&
                item.version === entry.version &&
                item.digest === entry.digest,
        );
        if (!imported) {
            throw new Error("Imported provider manifest is unavailable");
        }
        return imported;
    }

    private status(message: string): void {
        this.shadowRoot!.querySelector("[role=status]")!.textContent = message;
    }

    private management(): ProviderManagement {
        return this.shadowRoot!.querySelector("cms-provider-management") as ProviderManagement;
    }

    private connectModal(): ModalControl {
        return this.shadowRoot!.querySelector("[data-connect-modal]") as ModalControl;
    }
}

customElements.define("cms-provider-catalogue", ProviderCatalogue);
