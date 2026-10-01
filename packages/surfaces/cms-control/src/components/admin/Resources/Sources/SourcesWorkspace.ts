import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { Dashboard } from "../Dashboards/domain/types";
import { renderSourceCatalogue } from "./catalogue";
import {
    contractReleases,
    readyContractVersions,
    type SourceCatalogue,
    type SourceInstallations,
    sourceMetadata,
    sourceUpgrade,
    sourceUpgradeNote,
} from "./model";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type ValueControl = HTMLElement & { value: string };
type Modal = HTMLElement & { showModal(): void; hide(): void };

class SourcesWorkspace extends HTMLElement {
    private catalogue: SourceCatalogue = { available: [], repositories: [] };
    private installations: SourceInstallations = { installations: [], selected: [] };
    private dashboards: Dashboard[] = [];

    connectedCallback(): void {
        if (this.querySelector("[data-catalogue]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        this.querySelector("[data-search]")!.addEventListener("input", () => this.renderCatalogue());
        this.querySelector("[data-upgrade]")!.addEventListener("click", () => {
            const contractId = new URLSearchParams(location.search).get("source");
            if (contractId) {
                this.openModal(contractId);
            }
        });
        this.querySelector("[data-source-cancel]")!.addEventListener("click", () => this.modal().hide());
        this.querySelector("[data-provider]")!.addEventListener("change", () => this.renderVersions());
        this.querySelector("[data-contract]")!.addEventListener("change", () => this.renderVersions());
        this.querySelector("[data-source-form]")!.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.install();
        });
        this.querySelector("[data-catalogue]")!.addEventListener("click", (event) => {
            const contractId = (event.target as Element).closest<HTMLElement>("[data-import-contract]")?.dataset
                .importContract;
            if (contractId) {
                if (this.installations.selected.some((item) => item.contractId === contractId)) {
                    location.href = `${getMetaBasePath()}/admin/sources?source=${encodeURIComponent(contractId)}`;
                } else {
                    this.openModal(contractId);
                }
            }
        });
        void this.load();
    }

    private async load(): Promise<void> {
        this.showState("loading");
        try {
            const base = getMetaBasePath();
            const responses = await Promise.all([
                fetch(`${base}/api/provider-catalogue`, { cache: "no-store" }),
                fetch(`${base}/api/provider-installations`, { cache: "no-store" }),
                fetch(`${base}/api/dashboards`, { cache: "no-store" }),
            ]);
            if (responses.some((response) => !response.ok)) {
                throw new Error("Sources could not be loaded");
            }
            this.catalogue = (await responses[0]!.json()) as SourceCatalogue;
            this.installations = (await responses[1]!.json()) as SourceInstallations;
            this.dashboards = ((await responses[2]!.json()) as { dashboards: Dashboard[] }).dashboards;
            this.render();
            this.showState("ready");
            this.status("");
        } catch (error) {
            this.querySelector("[data-view-error-message]")!.textContent =
                error instanceof Error ? error.message : "Sources could not be loaded.";
            this.showState("error");
        }
    }

    private showState(state: "loading" | "error" | "ready"): void {
        this.querySelector<HTMLElement>("[data-view-loading]")!.hidden = state !== "loading";
        this.querySelector<HTMLElement>("[data-view-error]")!.hidden = state !== "error";
        if (state !== "ready") {
            this.querySelector<HTMLElement>("[data-explore]")!.hidden = true;
            this.querySelector<HTMLElement>("[data-detail]")!.hidden = true;
        }
        this.setAttribute("aria-busy", String(state === "loading"));
    }

    private render(): void {
        const contractId = new URLSearchParams(location.search).get("source");
        this.querySelector("[data-explore]")!.toggleAttribute("hidden", Boolean(contractId));
        this.querySelector("[data-detail]")!.toggleAttribute("hidden", !contractId);
        this.renderNav(contractId);
        if (contractId) {
            this.renderDetail(contractId);
        } else {
            this.renderCatalogue();
        }
    }

    private renderNav(active: string | null): void {
        const nav = document.querySelector("[data-source-nav]")!;
        nav.querySelector("[data-source-explore]")!.toggleAttribute("active", !active);
        nav.querySelectorAll("[data-source-item]").forEach((item) => item.remove());
        const anchor = nav.querySelector("[data-source-anchor]")!;
        for (const selected of this.installations.selected) {
            const metadata = sourceMetadata(this.catalogue, selected);
            const item = document.createElement("w13c-lateral-menu-item");
            item.dataset.sourceItem = "";
            item.setAttribute("manual-active", "");
            item.setAttribute(
                "href",
                `${getMetaBasePath()}/admin/sources?source=${encodeURIComponent(selected.contractId)}`,
            );
            item.toggleAttribute("active", selected.contractId === active);
            item.setAttribute("title", selected.contractId);
            const icon = document.createElement("cms-library-icon");
            icon.slot = "icon";
            icon.setAttribute("name", metadata?.icon ?? selected.contractId.split(".")[0] ?? "folder");
            item.append(icon, metadata?.name ?? selected.contractId);
            anchor.before(item);
        }
    }

    private renderCatalogue(): void {
        const query = (this.querySelector("[data-search]") as HTMLInputElement).value.trim().toLowerCase();
        const count = renderSourceCatalogue(
            this.querySelector("[data-catalogue]")!,
            this.catalogue,
            this.installations,
            query,
        );
        this.querySelector("[data-catalogue-empty]")!.toggleAttribute("hidden", count > 0);
    }

    private renderDetail(contractId: string): void {
        const selection = this.installations.selected.find((item) => item.contractId === contractId);
        const installation = this.installations.installations.find((item) => item.id === selection?.installationId);
        const metadata = sourceMetadata(this.catalogue, selection) ?? contractReleases(this.catalogue, contractId)[0];
        const upgrade = sourceUpgrade(this.catalogue, this.installations, selection);
        this.querySelector("[data-source-title]")!.textContent = metadata?.name ?? contractId;
        this.querySelector("[data-source-description]")!.textContent =
            metadata?.description ?? `Contract ${contractId}`;
        this.querySelector("[data-source-key]")!.textContent = contractId;
        this.querySelector("[data-source-version]")!.textContent = selection
            ? `v${selection.version} · ${selection.digest.slice(0, 18)}…`
            : "No release selected";
        this.querySelector("[data-repository-version]")!.textContent = upgrade.latestRepository
            ? `v${upgrade.latestRepository.version}`
            : selection
              ? `v${selection.version} (latest)`
              : "Unavailable";
        this.querySelector("[data-provider-name]")!.textContent = installation
            ? `${installation.providerId} · ${installation.accountId}`
            : "Unavailable";
        this.querySelector("[data-provider-state]")!.textContent = installation
            ? installation.status.charAt(0).toUpperCase() + installation.status.slice(1)
            : "Unavailable";
        this.querySelector("[data-provider-observed]")!.textContent = installation?.observedAt
            ? new Date(installation.observedAt).toLocaleString()
            : "Not checked";
        this.querySelector("[data-contract-state]")!.textContent =
            installation?.contracts.find(
                (item) =>
                    item.contractId === contractId &&
                    item.version === selection?.version &&
                    item.digest === selection.digest,
            )?.status ?? "Unavailable";
        this.querySelector("[data-provider-upgrade]")!.textContent = upgrade.readyRelease
            ? `v${upgrade.readyRelease.version} · ${upgrade.readyProvider!.providerId} · ${upgrade.readyProvider!.accountId}`
            : upgrade.latestRepository
              ? "Not offered by a connected provider"
              : "No upgrade required";
        const upgradeButton = this.querySelector("[data-upgrade]")!;
        upgradeButton.toggleAttribute("disabled", !upgrade.readyRelease);
        upgradeButton.textContent = upgrade.readyRelease
            ? `Upgrade to v${upgrade.readyRelease.version}`
            : "Upgrade source";
        this.querySelector("[data-upgrade-note]")!.textContent = sourceUpgradeNote(selection, upgrade);
        const dashboards = this.dashboards.filter(
            (item) => item.enabled && item.mounts.length > 0 && item.sourceContracts?.includes(contractId),
        );
        this.querySelector("[data-source-dashboards]")!.replaceChildren(
            ...dashboards.flatMap((dashboard) => {
                const first = dashboard.mounts[0];
                if (!first) {
                    return [];
                }
                const card = document.createElement("p9r-card");
                const title = document.createElement("h2");
                title.slot = "title";
                title.textContent = dashboard.name;
                const link = document.createElement("a");
                link.slot = "actions";
                link.href = `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(dashboard.id)}&viewId=${encodeURIComponent(`${first.collectionId}:${first.viewId}`)}`;
                link.textContent = "Open dashboard";
                card.append(title, link);
                return [card];
            }),
        );
        this.querySelector("[data-no-dashboards]")!.toggleAttribute("hidden", dashboards.length > 0);
    }

    private openModal(contractId = ""): void {
        const provider = this.field("[data-provider]");
        provider.replaceChildren(
            ...this.installations.installations.map(
                (item) => new Option(`${item.providerId} · ${item.accountId}`, item.id),
            ),
        );
        const contracts = [
            ...new Set(this.catalogue.available.filter((entry) => entry.kind === "contract").map((entry) => entry.id)),
        ];
        const contract = this.field("[data-contract]");
        contract.replaceChildren(
            ...contracts.map((id) => new Option(contractReleases(this.catalogue, id)[0]?.name ?? id, id)),
        );
        const initialContract = contractId || contracts[0] || "";
        contract.setAttribute("value", initialContract);
        const upgrading = this.installations.selected.some((item) => item.contractId === initialContract);
        contract.toggleAttribute("disabled", upgrading);
        const selectedProvider = this.installations.selected.find(
            (item) => item.contractId === initialContract,
        )?.installationId;
        const initialProvider =
            [
                ...this.installations.installations.filter((item) => item.id === selectedProvider),
                ...this.installations.installations.filter((item) => item.id !== selectedProvider),
            ].find((item) => this.readyVersions(item.id, initialContract).length)?.id ??
            this.installations.installations[0]?.id ??
            "";
        provider.setAttribute("value", initialProvider);
        this.querySelector("[data-modal-title]")!.textContent = upgrading ? "Upgrade source" : "Connect source";
        this.querySelector("[data-modal-submit]")!.textContent = upgrading ? "Save source" : "Connect source";
        this.renderVersions(initialProvider, initialContract);
        this.modal().showModal();
    }

    private renderVersions(
        providerId = this.field("[data-provider]").value,
        contractId = this.field("[data-contract]").value,
    ): void {
        const provider = this.installations.installations.find((item) => item.id === providerId);
        const versions = this.readyVersions(providerId, contractId);
        const version = this.field("[data-version]");
        version.replaceChildren(
            ...versions.map((entry, index) => new Option(`${entry.version} · ${entry.repositoryId}`, String(index))),
        );
        version.setAttribute("value", versions.length ? "0" : "");
        this.querySelector("[data-source-hint]")!.textContent = !provider
            ? "Connect a provider in Settings first."
            : versions.length
              ? "Only releases reported ready by this provider are listed."
              : "This provider has no ready release for this contract or upgrade.";
        (this.querySelector('[form="source-import-form"]') as HTMLElement & { disabled: boolean }).disabled =
            !versions.length;
    }

    private async install(): Promise<void> {
        const provider = this.installations.installations.find(
            (item) => item.id === this.field("[data-provider]").value,
        );
        const contractId = this.field("[data-contract]").value;
        const versions = this.readyVersions(provider?.id ?? "", contractId);
        const entry = versions[Number(this.field("[data-version]").value)];
        if (!provider || !entry) {
            return;
        }
        try {
            const response = await fetch(`${getMetaBasePath()}/api/source-select`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repositoryId: entry.repositoryId,
                    publisherId: entry.publisherId,
                    id: entry.id,
                    version: entry.version,
                    digest: entry.digest,
                    installationId: provider.id,
                }),
            });
            if (!response.ok) {
                throw new Error(`Source import failed (${response.status}): ${await response.text()}`);
            }
            this.modal().hide();
            location.href = `${getMetaBasePath()}/admin/sources?source=${encodeURIComponent(entry.id)}`;
        } catch (error) {
            this.status(String(error));
        }
    }

    private readyVersions(providerId: string, contractId: string): RepositoryArtifactEntry[] {
        return readyContractVersions(this.catalogue, this.installations, providerId, contractId);
    }

    private field(selector: string): ValueControl {
        return this.querySelector(selector) as ValueControl;
    }

    private modal(): Modal {
        return this.querySelector("[data-source-modal]") as Modal;
    }

    private status(message: string): void {
        this.querySelector("[data-status]")!.textContent = message;
    }
}

customElements.define("cms-sources-workspace", SourcesWorkspace);
