import type { RepositoryArtifactEntry } from "@bernouy/cms-repository/providers/sources";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import {
    contractReleases,
    readyContractVersions,
    readyProviders,
    type SourceCatalogue,
    type SourceInstallations,
} from "./model";

type ValueControl = HTMLElement & { value: string };
type Modal = HTMLElement & { showModal(): void; hide(): void };

export class SourceDialogController {
    constructor(
        private readonly host: HTMLElement,
        private readonly catalogue: () => SourceCatalogue,
        private readonly installations: () => SourceInstallations,
        private readonly status: (message: string) => void,
    ) {
        this.query("[data-source-cancel]").addEventListener("click", () => this.modal().hide());
        this.query("[data-provider]").addEventListener("change", () => this.renderVersions());
        this.query("[data-contract]").addEventListener("change", () => this.renderProviders());
        this.query("[data-source-form]").addEventListener("submit", (event) => {
            event.preventDefault();
            void this.install();
        });
    }

    open(contractId = ""): void {
        const state = this.installations();
        const contracts = [
            ...new Set(
                this.catalogue()
                    .available.filter((entry) => entry.kind === "contract")
                    .map((entry) => entry.id),
            ),
        ];
        const contract = this.field("[data-contract]");
        contract.replaceChildren(
            ...contracts.map((id) => new Option(contractReleases(this.catalogue(), id)[0]?.name ?? id, id)),
        );
        const initialContract = contractId || contracts[0] || "";
        contract.value = initialContract;
        const upgrading = state.selected.some((item) => item.contractId === initialContract);
        contract.toggleAttribute("disabled", upgrading);
        const selectedProvider = state.selected.find((item) => item.contractId === initialContract)?.installationId;
        this.query("[data-modal-title]").textContent = upgrading ? "Upgrade source" : "Connect source";
        this.query("[data-modal-submit]").textContent = upgrading ? "Save source" : "Connect source";
        this.renderProviders(initialContract, selectedProvider);
        this.modal().showModal();
    }

    private renderProviders(contractId = this.field("[data-contract]").value, preferredId = ""): void {
        const providers = readyProviders(this.catalogue(), this.installations(), contractId);
        const provider = this.field("[data-provider]");
        provider.replaceChildren(
            ...providers.map((item) => new Option(`${item.providerId} · ${item.accountId}`, item.id)),
        );
        const selected = providers.find((item) => item.id === preferredId) ?? providers[0];
        provider.value = selected?.id ?? "";
        this.renderVersions(provider.value, contractId);
    }

    private renderVersions(
        providerId = this.field("[data-provider]").value,
        contractId = this.field("[data-contract]").value,
    ): void {
        const provider = this.installations().installations.find((item) => item.id === providerId);
        const versions = this.readyVersions(providerId, contractId);
        const version = this.field("[data-version]");
        version.replaceChildren(
            ...versions.map((entry, index) => new Option(`${entry.version} · ${entry.repositoryId}`, String(index))),
        );
        version.value = versions.length ? "0" : "";
        this.query("[data-source-hint]").textContent = !provider
            ? "Connect a compatible provider in Settings first."
            : versions.length
              ? "Only releases reported ready by this provider are listed."
              : "No compatible release is ready through this provider.";
        (this.query('[form="source-import-form"]') as HTMLElement & { disabled: boolean }).disabled = !versions.length;
    }

    private async install(): Promise<void> {
        const provider = this.installations().installations.find(
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
        return readyContractVersions(this.catalogue(), this.installations(), providerId, contractId);
    }

    private query(selector: string): HTMLElement {
        return this.host.querySelector(selector) as HTMLElement;
    }

    private field(selector: string): ValueControl {
        return this.query(selector) as ValueControl;
    }

    private modal(): Modal {
        return this.query("[data-source-modal]") as Modal;
    }
}
