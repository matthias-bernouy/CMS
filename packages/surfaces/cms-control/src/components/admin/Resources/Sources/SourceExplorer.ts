import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { currentUrn, fetchSource, fetchSources, route } from "./api";
import { endpointKey, endpointLabel, endpointPath, inputRows, outputRows, type ContractRow } from "./domain";
import type { SourceDetail, SourceRow } from "./types";

export class SourceExplorer extends Component {
    private rows: SourceRow[] = [];
    private active: SourceDetail | null = null;
    private selectedUrn = "";
    private selectedEndpoint = "";

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.selectedUrn = currentUrn();
        void this.load();
    }

    private async load(): Promise<void> {
        try {
            this.rows = await fetchSources();
            this.selectedUrn ||= this.rows[0]?.urn ?? "";
            if (this.selectedUrn) await this.loadSource(this.selectedUrn);
        } catch {
            this.active = null;
        }
        this.render();
    }

    private async select(urn: string): Promise<void> {
        this.selectedUrn = urn;
        history.replaceState(null, "", route(`/admin/sources?urn=${encodeURIComponent(urn)}`));
        await this.loadSource(urn);
        this.render();
    }

    private async loadSource(urn: string): Promise<void> {
        this.active = await fetchSource(urn);
        if (!this.active.endpoints.some(endpoint => endpointKey(endpoint) === this.selectedEndpoint)) {
            this.selectedEndpoint = this.active.endpoints[0] ? endpointKey(this.active.endpoints[0]) : "";
        }
    }

    private render(): void {
        this.renderList();
        this.renderDetail();
    }

    private renderList(): void {
        const list = this.query<HTMLElement>("[data-list]");
        const itemTemplate = this.query<HTMLTemplateElement>("[data-source-template]");
        const endpointTemplate = this.query<HTMLTemplateElement>("[data-endpoint-template]");
        list.replaceChildren();
        if (!this.rows.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No sources. Run an integration to generate source contracts.";
            list.append(empty);
            return;
        }
        for (const row of this.rows) {
            const item = itemTemplate.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
            item.dataset.urn = row.urn;
            item.classList.toggle("active", row.urn === this.selectedUrn);
            item.querySelector("[data-name]")!.textContent = row.name;
            item.querySelector("[data-meta]")!.textContent = `${row.endpointCount} endpoint${row.endpointCount === 1 ? "" : "s"}`;
            item.addEventListener("click", () => void this.select(row.urn));
            list.append(item);
            if (row.urn === this.selectedUrn && this.active) this.renderEndpointNav(list, endpointTemplate);
        }
    }

    private renderEndpointNav(root: HTMLElement, template: HTMLTemplateElement): void {
        const group = document.createElement("div");
        group.className = "endpoint-nav";
        for (const endpoint of this.active?.endpoints ?? []) {
            const item = template.content.firstElementChild!.cloneNode(true) as HTMLButtonElement;
            const key = endpointKey(endpoint);
            item.classList.toggle("active", key === this.selectedEndpoint);
            item.querySelector("[data-method]")!.textContent = endpoint.method;
            item.querySelector("[data-endpoint-name]")!.textContent = endpointLabel(endpoint);
            item.querySelector("[data-path]")!.textContent = endpointPath(endpoint);
            item.addEventListener("click", () => { this.selectedEndpoint = key; this.renderDetail(); this.renderList(); });
            group.append(item);
        }
        root.append(group);
    }

    private renderDetail(): void {
        const empty = this.query<HTMLElement>("[data-empty]");
        const hero = this.query<HTMLElement>("[data-hero]");
        const detail = this.query<HTMLElement>("[data-detail]");
        empty.hidden = Boolean(this.active);
        hero.hidden = !this.active;
        detail.hidden = !this.active;
        if (!this.active) return;
        this.text("[data-source-name]", this.active.name);
        this.text("[data-source-urn]", this.active.urn);
        this.text("[data-source-state]", this.active.readonly ? "Readonly" : "Managed");
        this.text("[data-endpoint-count]", String(this.active.endpointCount));
        this.renderEndpointDetail();
    }

    private renderEndpointDetail(): void {
        const endpoint = this.active?.endpoints.find(item => endpointKey(item) === this.selectedEndpoint);
        this.query<HTMLElement>("[data-contract]").hidden = !endpoint;
        if (!endpoint) return;
        this.text("[data-current-method]", endpoint.method);
        this.text("[data-current-name]", endpointLabel(endpoint));
        this.text("[data-current-path]", endpointPath(endpoint));
        this.renderRows("[data-inputs]", inputRows(endpoint), "No inputs");
        this.renderRows("[data-outputs]", outputRows(endpoint), "No outputs");
    }

    private renderRows(selector: string, rows: ContractRow[], emptyText: string): void {
        const root = this.query<HTMLElement>(selector);
        const template = this.query<HTMLTemplateElement>("[data-contract-row-template]");
        root.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = emptyText;
            root.append(empty);
            return;
        }
        for (const row of rows) {
            const item = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
            item.querySelector("[data-label]")!.textContent = row.label;
            item.querySelector("[data-value]")!.textContent = row.value;
            item.querySelector("[data-detail]")!.textContent = row.detail ?? "";
            root.append(item);
        }
    }

    private text(selector: string, value: string): void {
        this.query<HTMLElement>(selector).textContent = value;
    }

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-sources-admin")) customElements.define("cms-sources-admin", SourceExplorer);
