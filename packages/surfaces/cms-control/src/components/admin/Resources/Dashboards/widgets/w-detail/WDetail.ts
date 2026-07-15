import { Component } from "@bernouy/components/base";
import { valueAt } from "../../runtime/expressions";
import { detailData, fieldValues } from "../../runtime/mapping";
import "../w-section/WSection";
import "cms-control/components/admin/ShellDetail/ShellDetail";
import { applyLookupOption, DetailView } from "./runtime/detailView";
import { DetailEvents } from "./runtime/events";
import { DetailFieldState, parseJson, type DetailWidget } from "./runtime/fieldState";
import { DetailLookups } from "./runtime/lookups";
import { DetailRequestCoordinator } from "./runtime/requests";
import type { WDetailData, WDetailField, WDetailSection } from "./types";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWDetail extends Component {
    private value: WDetailData = emptyDetailData();
    private readonly fields: DetailFieldState;
    private readonly view: DetailView;
    private readonly requests: DetailRequestCoordinator;
    private readonly lookups: DetailLookups;
    private readonly events: DetailEvents;
    private bindingRevision = 0;
    private connectionRevision = 0;
    private syncScheduled = false;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        const root = this.shadowRoot!;
        this.fields = new DetailFieldState(root, this.dataset, () => this.value);
        this.view = new DetailView(root);
        this.requests = new DetailRequestCoordinator();
        this.lookups = new DetailLookups(this.dataset, this.fields, this.requests, {
            setData: value => { this.value = value; },
            render: () => this.render(),
            isConnected: () => this.isConnected,
        });
        this.events = new DetailEvents(
            this,
            root,
            this.fields,
            this.lookups,
            () => this.value,
            () => this.refreshConditionalFields(),
        );
    }

    set data(value: WDetailData) {
        this.value = value;
        if (this.isConnected) this.render();
    }

    applyLookupCreate(fieldId: string, value: unknown, option: { value: string; label: string }): void {
        const control = this.fields.control(fieldId);
        const field = control ? this.fields.find(fieldId) : undefined;
        if (control && field) applyLookupOption(control, value, option);
    }

    static get observedAttributes(): string[] {
        return ["data-config-json", "data-source-json", "data-row-key", "data-source-id"];
    }

    attributeChangedCallback(): void {
        this.bindingRevision += 1;
        this.scheduleBoundDataSync();
    }

    override connectedCallback(): void {
        this.connectionRevision += 1;
        this.syncScheduled = false;
        this.events.bind();
        this.syncBoundData();
    }

    disconnectedCallback(): void {
        this.connectionRevision += 1;
        this.syncScheduled = false;
        this.events.unbind();
        this.resetInvalidState();
    }

    private render(): void {
        this.view.render(this.value);
    }

    private refreshConditionalFields(): void {
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        const resource = this.fields.currentResource();
        if (!widget || resource === undefined) return;
        const previous = this.value;
        const next = detailData(
            widget,
            resource,
            this.value.rowKey,
            this.fields.currentFields(),
            this.lookups.options,
            this.dataset.sourceId ?? "",
        );
        this.value = next;
        this.view.refresh(previous, next);
    }

    private syncBoundData(): void {
        const configJson = this.dataset.configJson ?? "";
        const widget = parseJson<DetailWidget>(configJson);
        const sourceJson = this.dataset.sourceJson ?? "";
        const sourceData = parseJson<unknown>(sourceJson);
        if (!widget || widget.widget !== "w-detail" || !sourceJson || sourceData === null) {
            this.resetInvalidState();
            return;
        }
        const resource = widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
        if (resource === undefined) {
            this.resetInvalidState();
            return;
        }
        const rowKey = this.dataset.rowKey ?? "";
        const sourceId = this.dataset.sourceId ?? "";
        const scopeKey = JSON.stringify([sourceId, widget.id, rowKey, this.bindingRevision]);
        this.requests.syncScope(scopeKey);
        this.fields.syncScope(scopeKey);
        this.lookups.syncScope(scopeKey);
        this.value = detailData(widget, resource, rowKey, this.fields.draft, this.lookups.options, sourceId);
        if (this.isConnected) this.render();
        if (!sourceId) return;
        void this.lookups.load(widget, resource, rowKey, sourceId, fieldValues(widget, resource), { useLatestFields: true });
    }

    private scheduleBoundDataSync(): void {
        if (!this.isConnected) return;
        this.invalidateRequests();
        if (this.syncScheduled) return;
        this.syncScheduled = true;
        const connectionRevision = this.connectionRevision;
        queueMicrotask(() => {
            if (this.connectionRevision !== connectionRevision) return;
            this.syncScheduled = false;
            if (this.isConnected) this.syncBoundData();
        });
    }

    private invalidateRequests(): void {
        this.lookups.clear();
        this.requests.clear();
    }

    private resetInvalidState(): void {
        this.invalidateRequests();
        this.requests.syncScope("");
        this.fields.syncScope("");
        this.lookups.syncScope("");
        this.value = emptyDetailData();
        if (this.isConnected) this.render();
    }
}

if (!customElements.get("cms-dashboard-w-detail")) customElements.define("cms-dashboard-w-detail", DashboardWDetail);

export type { WDetailData, WDetailField, WDetailSection };

function emptyDetailData(): WDetailData {
    return { rowKey: "", eyebrow: "", title: "", actions: [], main: [], aside: [] };
}
