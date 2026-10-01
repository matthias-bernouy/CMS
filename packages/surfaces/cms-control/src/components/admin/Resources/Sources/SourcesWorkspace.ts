import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { Dashboard } from "../Dashboards/domain/types";
import { renderSourceCatalogue } from "./catalogue";
import { SourceDialogController } from "./dialog";
import type { SourceCatalogue, SourceInstallations } from "./model";
import { renderSourceDetail, renderSourceNavigation } from "./view";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

class SourcesWorkspace extends HTMLElement {
    private catalogue: SourceCatalogue = { available: [], repositories: [] };
    private installations: SourceInstallations = { installations: [], selected: [] };
    private dashboards: Dashboard[] = [];
    private dialog?: SourceDialogController;

    connectedCallback(): void {
        if (this.querySelector("[data-catalogue]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.dialog = new SourceDialogController(
            this,
            () => this.catalogue,
            () => this.installations,
            (message) => this.status(message),
        );
        this.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        this.querySelector("[data-search]")!.addEventListener("input", () => this.renderCatalogue());
        this.querySelector("[data-upgrade]")!.addEventListener("click", () => {
            const contractId = new URLSearchParams(location.search).get("source");
            if (contractId) {
                this.dialog!.open(contractId);
            }
        });
        this.querySelector("[data-catalogue]")!.addEventListener("click", (event) => this.onCatalogueClick(event));
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
            this.status("");
            this.render();
            this.showState("ready");
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
        let contractId = new URLSearchParams(location.search).get("source");
        if (contractId && !this.installations.selected.some((item) => item.contractId === contractId)) {
            history.replaceState({}, "", `${getMetaBasePath()}/admin/sources`);
            this.status("That source is not installed. Choose it from Explore sources first.");
            contractId = null;
        }
        this.querySelector("[data-explore]")!.toggleAttribute("hidden", Boolean(contractId));
        this.querySelector("[data-detail]")!.toggleAttribute("hidden", !contractId);
        renderSourceNavigation(this.catalogue, this.installations, contractId);
        if (contractId) {
            renderSourceDetail(this, contractId, this.catalogue, this.installations, this.dashboards);
        } else {
            this.renderCatalogue();
        }
    }

    private renderCatalogue(): void {
        const query = this.querySelector<HTMLInputElement>("[data-search]")!.value.trim().toLowerCase();
        const count = renderSourceCatalogue(
            this.querySelector("[data-catalogue]")!,
            this.catalogue,
            this.installations,
            query,
        );
        this.querySelector("[data-catalogue-empty]")!.toggleAttribute("hidden", count > 0);
    }

    private onCatalogueClick(event: Event): void {
        const contractId = (event.target as Element).closest<HTMLElement>("[data-import-contract]")?.dataset
            .importContract;
        if (!contractId) {
            return;
        }
        if (this.installations.selected.some((item) => item.contractId === contractId)) {
            location.href = `${getMetaBasePath()}/admin/sources?source=${encodeURIComponent(contractId)}`;
        } else {
            this.dialog!.open(contractId);
        }
    }

    private status(message: string): void {
        this.querySelector("[data-status]")!.textContent = message;
    }
}

customElements.define("cms-sources-workspace", SourcesWorkspace);
