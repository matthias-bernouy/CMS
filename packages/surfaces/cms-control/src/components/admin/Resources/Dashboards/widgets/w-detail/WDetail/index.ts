import { Component } from "@bernouy/components/base";
import { fieldValues } from "../../../runtime/mapping";
import "../../w-section/WSection";
import "cms-control/components/admin/Layout/ShellDetail/ShellDetail";
import { applyLookupOption } from "../runtime/detailView";
import { readDetailBinding } from "../runtime/fieldState";
import schemaCss from "../runtime/schemas/style.css" with { type: "text" };
import type { WDetailData, WDetailField, WDetailSection } from "../types";
import baseCss from "./base.css" with { type: "text" };
import controlsCss from "./controls.css" with { type: "text" };
import { createDetailRuntime, DetailSyncScheduler, mapDetailData, type DetailRuntime } from "./runtime";
import template from "./template.html" with { type: "text" };

const styles = [baseCss, controlsCss, schemaCss].join("\n") as unknown as string;

export class DashboardWDetail extends Component {
    private value: WDetailData = emptyDetailData();
    private readonly runtime: DetailRuntime;
    private readonly syncScheduler = new DetailSyncScheduler();
    private mode: "bound" | "manual" = "bound";
    private bindingRevision = 0;

    constructor() {
        super({ css: styles, template: template as unknown as string });
        this.runtime = createDetailRuntime(this, this.shadowRoot!, {
            data: () => this.value,
            setData: (value) => {
                this.value = value;
            },
            render: () => this.render(),
            isConnected: () => this.isConnected,
            isBound: () => this.mode === "bound",
            refreshConditionalFields: () => this.refreshConditionalFields(),
        });
    }

    set data(value: WDetailData) {
        this.mode = "manual";
        this.syncScheduler.advanceLifecycle();
        this.clearRuntimeState();
        this.value = value;
        if (this.isConnected) {
            this.render();
        }
    }

    applyLookupCreate(fieldId: string, value: unknown, option: { value: string; label: string }): void {
        const control = this.runtime.fields.control(fieldId);
        const field = control ? this.runtime.fields.find(fieldId) : undefined;
        if (control && field) {
            applyLookupOption(control, value, option);
        }
    }

    static get observedAttributes(): string[] {
        return ["data-config-json", "data-source-json", "data-row-key", "data-source-id"];
    }

    attributeChangedCallback(): void {
        this.mode = "bound";
        this.bindingRevision += 1;
        this.scheduleBoundDataSync();
    }

    override connectedCallback(): void {
        this.syncScheduler.advanceLifecycle();
        this.runtime.events.bind();
        if (this.mode === "manual") {
            this.render();
        } else {
            this.syncBoundData();
        }
    }

    disconnectedCallback(): void {
        this.syncScheduler.advanceLifecycle();
        this.runtime.events.unbind();
        this.resetState(true);
    }

    private render(): void {
        this.runtime.view.render(this.value);
    }

    private refreshConditionalFields(): void {
        if (this.mode !== "bound") {
            return;
        }
        const binding = readDetailBinding(this.dataset);
        if (!binding) {
            return;
        }
        const previous = this.value;
        const next = mapDetailData(
            this.runtime,
            binding.widget,
            binding.resource,
            this.value.rowKey,
            this.runtime.fields.currentFields(),
            this.dataset.sourceId ?? "",
        );
        this.value = next;
        this.runtime.view.refresh(previous, next);
    }

    private syncBoundData(): void {
        const binding = readDetailBinding(this.dataset);
        if (!binding) {
            this.resetState();
            return;
        }
        const { widget, resource, rowKey, sourceId } = binding;
        const scopeKey = JSON.stringify([sourceId, widget.id, rowKey, this.bindingRevision]);
        this.runtime.requests.syncScope(scopeKey);
        this.runtime.fields.syncScope(scopeKey);
        this.runtime.lookups.syncScope(scopeKey);
        this.runtime.schemas.syncScope(scopeKey);
        this.value = mapDetailData(
            this.runtime,
            widget,
            resource,
            rowKey,
            this.runtime.fields.draft,
            this.dataset.sourceId ?? "",
        );
        if (this.isConnected) {
            this.render();
        }
        if (!sourceId) {
            return;
        }
        const fields = fieldValues(widget, resource);
        void this.runtime.lookups.load(widget, resource, rowKey, sourceId, fields, { useLatestFields: true });
        void this.runtime.schemas.load(widget, resource, rowKey, sourceId, fields, { useLatestFields: true });
    }

    private scheduleBoundDataSync(): void {
        this.syncScheduler.schedule(
            () => this.isConnected,
            () => this.mode === "bound",
            () => this.invalidateRequests(),
            () => this.syncBoundData(),
        );
    }

    private invalidateRequests(): void {
        this.runtime.lookups.clear();
        this.runtime.schemas.clear();
        this.runtime.requests.clear();
    }

    private clearRuntimeState(): void {
        this.invalidateRequests();
        this.runtime.fields.clear();
    }

    private resetState(forceRender = false): void {
        this.clearRuntimeState();
        this.value = emptyDetailData();
        if (forceRender || this.isConnected) {
            this.render();
        }
    }
}

if (!customElements.get("cms-dashboard-w-detail")) {
    customElements.define("cms-dashboard-w-detail", DashboardWDetail);
}

export type { WDetailData, WDetailField, WDetailSection };

function emptyDetailData(): WDetailData {
    return { rowKey: "", eyebrow: "", title: "", actions: [], main: [], aside: [] };
}
