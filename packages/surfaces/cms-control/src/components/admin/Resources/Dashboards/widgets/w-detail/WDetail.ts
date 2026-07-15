import { Component } from "@bernouy/components/base";
import { valueAt } from "../../runtime/expressions";
import { detailData, fieldValues } from "../../runtime/mapping";
import "../w-section/WSection";
import "cms-control/components/admin/ShellDetail/ShellDetail";
import { applyLookupOption, DetailView } from "./runtime/detailView";
import { DetailEvents } from "./runtime/events";
import { DetailFieldState, parseJson, type DetailWidget } from "./runtime/fieldState";
import { DetailLookups } from "./runtime/lookups";
import type { WDetailData, WDetailField, WDetailSection } from "./types";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWDetail extends Component {
    private value: WDetailData = { rowKey: "", eyebrow: "", title: "", actions: [], main: [], aside: [] };
    private readonly fields: DetailFieldState;
    private readonly view: DetailView;
    private readonly lookups: DetailLookups;
    private readonly events: DetailEvents;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        const root = this.shadowRoot!;
        this.fields = new DetailFieldState(root, this.dataset, () => this.value);
        this.view = new DetailView(root);
        this.lookups = new DetailLookups(this.dataset, this.fields, {
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
        this.syncBoundData();
    }

    override connectedCallback(): void {
        this.events.bind();
        this.syncBoundData();
        this.render();
    }

    disconnectedCallback(): void {
        this.events.unbind();
        this.lookups.clear();
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
        const widget = parseJson<DetailWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-detail") return;
        const sourceJson = this.dataset.sourceJson ?? "";
        const sourceData = parseJson<unknown>(sourceJson) ?? {};
        const resource = widget.source.itemPath ? valueAt(sourceData, widget.source.itemPath) : sourceData;
        const rowKey = this.dataset.rowKey ?? "";
        const sourceId = this.dataset.sourceId ?? "";
        const scopeKey = `${sourceId}:${widget.id}:${rowKey}`;
        this.fields.syncScope(`${scopeKey}:${sourceJson}`);
        this.lookups.syncScope(scopeKey);
        this.value = detailData(widget, resource, rowKey, this.fields.draft, this.lookups.options, sourceId);
        if (this.isConnected) this.render();
        if (!sourceJson || !sourceId) return;
        void this.lookups.load(widget, resource, rowKey, sourceId, fieldValues(widget, resource), { useLatestFields: true });
    }
}

if (!customElements.get("cms-dashboard-w-detail")) customElements.define("cms-dashboard-w-detail", DashboardWDetail);

export type { WDetailData, WDetailField, WDetailSection };
