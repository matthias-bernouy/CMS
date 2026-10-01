import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type Provider = {
    id: string;
    providerId: string;
    accountId: string;
    status: string;
    observedAt: string | null;
    contracts: { contractId: string; version: string; digest: string; status: string }[];
};
type Selection = { installationId: string; contractId: string; version: string; digest: string };
type Providers = { installations: Provider[]; selected: Selection[] };
type Collections = {
    installed: { collectionId: string; version: string }[];
    releases: { collectionId: string; version: string }[];
};
type Dashboards = { dashboards: { enabled: boolean; origin?: unknown }[] };

class HealthWorkspace extends HTMLElement {
    connectedCallback(): void {
        if (this.querySelector("[data-provider-list]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        const base = getMetaBasePath();
        for (const [selector, path] of [
            ["[data-providers-link]", "/admin/settings/providers"],
            ["[data-sources-link]", "/admin/sources"],
            ["[data-collections-link]", "/admin/collections"],
            ["[data-dashboards-link]", "/admin/dashboards"],
        ] as const) {
            this.querySelector(selector)!.setAttribute("href", `${base}${path}`);
        }
        void this.load();
    }

    private async load(): Promise<void> {
        const base = getMetaBasePath();
        const paths = ["provider-installations", "provider-catalogue", "collections/available", "dashboards"];
        const results = await Promise.allSettled(
            paths.map(async (path) => {
                const response = await fetch(`${base}/api/${path}`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`${path}: ${response.status}`);
                }
                return response.json() as Promise<unknown>;
            }),
        );
        const [providers, catalogue, collections, dashboards] = results.map((result) =>
            result.status === "fulfilled" ? result.value : null,
        ) as [
            Providers | null,
            { available: { id: string; kind: string; version: string; digest: string }[] } | null,
            Collections | null,
            Dashboards | null,
        ];
        this.renderProviders(providers);
        this.renderSources(providers, catalogue);
        this.renderCollections(collections);
        this.renderDashboards(dashboards);
        const unavailable = paths.filter((_, index) => results[index]!.status === "rejected");
        this.querySelector("[data-health-summary]")!.textContent = unavailable.length
            ? `${unavailable.length} area${unavailable.length === 1 ? "" : "s"} could not be checked.`
            : `${providers?.installations.length ?? 0} provider${providers?.installations.length === 1 ? "" : "s"} connected · ${providers?.selected.length ?? 0} source${providers?.selected.length === 1 ? "" : "s"} · ${collections?.installed.length ?? 0} collection${collections?.installed.length === 1 ? "" : "s"} · ${dashboards?.dashboards.filter((item) => item.enabled).length ?? 0} active dashboard${dashboards?.dashboards.filter((item) => item.enabled).length === 1 ? "" : "s"}`;
        this.querySelector("[data-health-status]")!.textContent = unavailable.length
            ? `Some checks are unavailable: ${unavailable.join(", ")}.`
            : "Provider and source readiness reflects the last recorded observation, not a live probe.";
    }

    private renderProviders(data: Providers | null): void {
        const list = this.querySelector("[data-provider-list]")!;
        if (!data) {
            list.textContent = "Provider state is unavailable.";
            return;
        }
        list.replaceChildren(
            ...data.installations.map((item) => {
                return this.row(
                    `${item.providerId} · ${item.accountId}`,
                    item.observedAt ? `Checked ${new Date(item.observedAt).toLocaleString()}` : "Not checked",
                    item.status,
                );
            }),
        );
        if (!data.installations.length) {
            list.textContent = "No provider is connected.";
        }
    }

    private renderSources(
        data: Providers | null,
        catalogue: { available: { id: string; kind: string; version: string; digest: string }[] } | null,
    ): void {
        const list = this.querySelector("[data-source-list]")!;
        if (!data) {
            list.textContent = "Source state is unavailable.";
            return;
        }
        list.replaceChildren(
            ...data.selected.map((selection) => {
                const provider = data.installations.find((item) => item.id === selection.installationId);
                const implementation = provider?.contracts.find(
                    (item) =>
                        item.contractId === selection.contractId &&
                        item.version === selection.version &&
                        item.digest === selection.digest,
                );
                const newer = catalogue?.available.some(
                    (item) =>
                        item.kind === "contract" &&
                        item.id === selection.contractId &&
                        compareSemVer(item.version, selection.version) > 0,
                );
                return this.row(
                    selection.contractId,
                    `v${selection.version}${newer ? " · Update available" : ""}`,
                    provider?.status === "enabled"
                        ? (implementation?.status ?? "Not reported")
                        : "Provider unavailable",
                );
            }),
        );
        if (!data.selected.length) {
            list.textContent = "No sources are connected.";
        }
    }

    private renderCollections(data: Collections | null): void {
        const list = this.querySelector("[data-collection-list]")!;
        if (!data) {
            list.textContent = "Collection state is unavailable.";
            return;
        }
        list.replaceChildren(
            ...data.installed.map((installed) => {
                const newer = data.releases.some(
                    (item) =>
                        item.collectionId === installed.collectionId &&
                        compareSemVer(item.version, installed.version) > 0,
                );
                return this.row(
                    installed.collectionId,
                    `v${installed.version}`,
                    newer ? "Update available" : "Installed",
                );
            }),
        );
        if (!data.installed.length) {
            list.textContent = "No collections are installed.";
        }
    }

    private renderDashboards(data: Dashboards | null): void {
        this.querySelector("[data-dashboard-list]")!.textContent = data
            ? `${data.dashboards.filter((item) => item.enabled).length} active of ${data.dashboards.length} dashboards`
            : "Dashboard state is unavailable.";
    }

    private row(name: string, detail: string, state: string): HTMLElement {
        const row = document.createElement("div");
        row.className = "health-row";
        const copy = document.createElement("div");
        copy.className = "health-row-copy";
        const title = document.createElement("strong");
        title.textContent = name;
        const meta = document.createElement("small");
        meta.textContent = detail;
        copy.append(title, meta);
        const badge = document.createElement("span");
        badge.className = "health-row-state";
        badge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
        row.append(copy, badge);
        return row;
    }
}

customElements.define("cms-health-workspace", HealthWorkspace);
