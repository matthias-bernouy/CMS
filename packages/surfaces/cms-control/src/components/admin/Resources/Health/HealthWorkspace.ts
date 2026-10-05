import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import {
    type Catalogue,
    type Collections,
    type HealthReport,
    type HealthRow,
    healthReport,
    type Providers,
} from "./model";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

class HealthWorkspace extends HTMLElement {
    connectedCallback(): void {
        if (this.querySelector("[data-provider-list]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        const base = getMetaBasePath();
        for (const [selector, path] of [
            ["[data-providers-link]", "/admin/settings/providers"],
            ["[data-sources-link]", "/admin/sources"],
            ["[data-collections-link]", "/admin/collections"],
        ] as const) {
            this.querySelector(selector)!.setAttribute("href", `${base}${path}`);
        }
        void this.load();
    }

    private async load(): Promise<void> {
        this.showState("loading");
        const base = getMetaBasePath();
        const paths = ["provider-installations", "provider-catalogue", "collections/available"];
        const results = await Promise.allSettled(
            paths.map(async (path) => {
                const response = await fetch(`${base}/api/${path}`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`${path}: ${response.status}`);
                }
                return response.json() as Promise<unknown>;
            }),
        );
        if (results.every((result) => result.status === "rejected")) {
            this.showState("error");
            return;
        }
        const [providers, catalogue, collections] = results.map((result) =>
            result.status === "fulfilled" ? result.value : null,
        ) as [Providers | null, Catalogue | null, Collections | null];
        const report = healthReport(base, providers, catalogue, collections);
        this.renderReport(report, providers, collections);
        const unavailable = paths.filter((_, index) => results[index]!.status === "rejected");
        const status = this.querySelector<HTMLElement>("[data-health-status]")!;
        status.textContent = unavailable.length
            ? `Some checks are unavailable: ${unavailable.join(", ")}.`
            : report.issues
              ? "Open an affected item to review its configuration or last observation."
              : "Provider and source readiness reflects the last recorded observation.";
        this.showState("ready");
    }

    private renderReport(report: HealthReport, providers: Providers | null, collections: Collections | null): void {
        this.renderRows("[data-provider-list]", report.providers, "No provider is connected.");
        this.renderRows("[data-source-list]", report.sources, "No sources are connected.");
        this.renderRows("[data-collection-list]", report.collections, "No collections are installed.");
        const counts = `${providers?.installations.length ?? 0} provider${providers?.installations.length === 1 ? "" : "s"} · ${providers?.selected.length ?? 0} source${providers?.selected.length === 1 ? "" : "s"} · ${collections?.installed.length ?? 0} collection${collections?.installed.length === 1 ? "" : "s"}`;
        this.querySelector("[data-health-summary]")!.textContent = report.issues
            ? `${report.issues} issue${report.issues === 1 ? "" : "s"} need attention · ${counts}`
            : `All monitored areas look healthy · ${counts}`;
    }

    private renderRows(selector: string, rows: HealthRow[], empty: string): void {
        const list = this.querySelector(selector)!;
        list.replaceChildren(...rows.map((row) => this.row(row)));
        if (!rows.length) {
            list.textContent = empty;
        }
    }

    private row(data: HealthRow): HTMLElement {
        const row = document.createElement("a");
        row.className = "health-row";
        row.href = data.href;
        const copy = document.createElement("div");
        copy.className = "health-row-copy";
        const title = document.createElement("strong");
        title.textContent = data.name;
        const detail = document.createElement("small");
        detail.textContent = data.detail;
        copy.append(title, detail);
        const state = document.createElement("span");
        state.className = "health-row-state";
        state.dataset.tone = data.tone;
        state.textContent = data.state;
        const arrow = document.createElement("span");
        arrow.className = "health-row-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "›";
        row.append(copy, state, arrow);
        return row;
    }

    private showState(state: "loading" | "error" | "ready"): void {
        this.querySelector<HTMLElement>("[data-view-loading]")!.hidden = state !== "loading";
        this.querySelector<HTMLElement>("[data-view-error]")!.hidden = state !== "error";
        this.querySelector<HTMLElement>("[data-view-content]")!.hidden = state !== "ready";
        this.querySelector<HTMLElement>("[data-health-status]")!.hidden = state !== "ready";
        this.setAttribute("aria-busy", String(state === "loading"));
    }
}

customElements.define("cms-health-workspace", HealthWorkspace);
