import { showToast } from "@bernouy/components";
import { currentSelection, DASHBOARD_SELECTION_EVENT, pushSelectionUrl, type DashboardSelection } from "../api";
import { detailKey } from "../domain";
import { configureDashboardBindingFilters } from "../runtime/mounting/bindingFilters";
import { updateDashboardWidgetExampleField } from "../widgets/example";
import {
    WIDGET_ACTION_EVENT,
    WIDGET_BACK_EVENT,
    WIDGET_FIELD_CHANGE_EVENT,
    WIDGET_FILTER_CHANGE_EVENT,
    WIDGET_MEDIA_ACTION_EVENT,
    WIDGET_ROW_SELECT_EVENT,
    type WidgetActionDetail,
    type WidgetFieldChangeDetail,
    type WidgetFilterChangeDetail,
    type WidgetMediaActionDetail,
    type WidgetRowSelectDetail,
} from "../widgets/shared";
import { runDashboardMediaAction, runDashboardWidgetAction } from "./actions";
import { DashboardViewController } from "./controller/DashboardViewController";
import { runDashboardLookupCreate } from "./DashboardViewLookups";
import baseCss from "./styles/base.css" with { type: "text" };
import panelsCss from "./styles/panels.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

const styles = [baseCss, panelsCss].join("\n") as unknown as string;

export class DashboardView extends DashboardViewController {
    constructor() {
        super(styles, template as unknown as string);
        configureDashboardBindingFilters();
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.syncFromSelection(currentSelection());
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener(WIDGET_ROW_SELECT_EVENT, this.onWidgetRowSelect as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_BACK_EVENT, this.onWidgetBack);
        this.shadowRoot!.addEventListener(WIDGET_ACTION_EVENT, this.onWidgetAction as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_FILTER_CHANGE_EVENT, this.onWidgetFilterChange as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_FIELD_CHANGE_EVENT, this.onWidgetFieldChange as EventListener);
        this.shadowRoot!.addEventListener(WIDGET_MEDIA_ACTION_EVENT, this.onWidgetMediaAction as EventListener);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
        this.startBoundSource();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener(WIDGET_ROW_SELECT_EVENT, this.onWidgetRowSelect as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_BACK_EVENT, this.onWidgetBack);
        this.shadowRoot?.removeEventListener(WIDGET_ACTION_EVENT, this.onWidgetAction as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_FILTER_CHANGE_EVENT, this.onWidgetFilterChange as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_FIELD_CHANGE_EVENT, this.onWidgetFieldChange as EventListener);
        this.shadowRoot?.removeEventListener(WIDGET_MEDIA_ACTION_EVENT, this.onWidgetMediaAction as EventListener);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
        this.disconnectBoundSource();
    }

    private onClick = (event: Event): void => {
        const tabButton = (event.target as Element | null)?.closest<HTMLElement>("[data-tab-key]");
        if (!tabButton?.dataset.tabKey || !tabButton.dataset.tabIndex) {
            return;
        }
        this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
        this.renderDashboard();
    };

    private onSelection = (event: CustomEvent<DashboardSelection>): void => this.syncSelectionAndRender(event.detail);
    private onPopState = (): void => this.syncSelectionAndRender(currentSelection());

    private onWidgetRowSelect = (event: CustomEvent<WidgetRowSelectDetail>): void => {
        this.invalidateDetailResource();
        this.detailSelection = { collection: event.detail.collection, row: event.detail.rowKey };
        if (!this.isExampleMode()) {
            pushSelectionUrl(this.selection());
        }
        this.renderDashboard();
    };

    private onWidgetBack = (): void => {
        this.invalidateDetailResource();
        this.clearDetail();
    };

    private onWidgetAction = (event: CustomEvent<WidgetActionDetail>): void => {
        if (this.isExampleMode()) {
            showToast(`${event.detail.action} clicked`, { type: "success" });
            return;
        }
        if (event.detail.target) {
            this.invalidateDetailResource();
            this.detailSelection = { collection: event.detail.target, row: "__new__" };
            pushSelectionUrl(this.selection());
            this.renderDashboard();
            return;
        }
        void runDashboardWidgetAction(this.actionContext(), event.detail);
    };

    private onWidgetMediaAction = (event: CustomEvent<WidgetMediaActionDetail>): void => {
        if (this.isExampleMode()) {
            showToast(`Media ${event.detail.action} event captured`, { type: "success" });
            return;
        }
        void runDashboardMediaAction(
            this.actionContext(),
            event.detail,
            event.target instanceof HTMLElement ? event.target : undefined,
        );
    };

    private onWidgetFilterChange = (event: CustomEvent<WidgetFilterChangeDetail>): void => {
        if (this.isExampleMode()) {
            showToast("Filters applied", { type: "success" });
            return;
        }
        this.setDashboardFilters(event.detail.widget, event.detail.filters);
        this.renderDashboard();
    };

    private onWidgetFieldChange = (event: CustomEvent<WidgetFieldChangeDetail>): void => {
        if (this.isExampleMode()) {
            updateDashboardWidgetExampleField(event.detail.rowKey, event.detail.field, event.detail.value);
            this.renderDashboard();
            return;
        }
        if (!this.detailSelection) {
            return;
        }
        const key = detailKey(this.detailSelection.collection, event.detail.rowKey);
        const previousDraft = this.drafts.get(key) ?? {};
        this.drafts.set(key, { ...previousDraft, [event.detail.field]: event.detail.value });
        if (event.detail.created) {
            void runDashboardLookupCreate(this.actionContext(), event.detail, previousDraft, event.target);
        }
    };
}

if (!customElements.get("cms-dashboards-admin")) {
    customElements.define("cms-dashboards-admin", DashboardView);
}
