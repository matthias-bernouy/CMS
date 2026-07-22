import type { DashboardWidget } from "@bernouy/cms-dashboards";
import type { RelationTableWidget } from "../../domain";
import { route } from "../../api";
import { appendSourceContent, jsonAttr, tableRowsTemplate, urlSourceWrapper } from "./mountSource";

export function relationDetailSectionElement(widget: RelationTableWidget): HTMLElement {
    const section = document.createElement("cms-detail-section");
    section.setAttribute("slot", widget.placement === "aside" ? "aside-extra" : "main-extra");
    section.setAttribute("heading", widget.title ?? "Related items");
    if (widget.placement === "aside") {
        section.setAttribute("density", "compact");
    }
    section.append(relationTableElement(widget));
    return section;
}

function relationTableElement(widget: RelationTableWidget): HTMLElement {
    const tableWidget: Extract<DashboardWidget, { widget: "w-table" }> = {
        widget: "w-table",
        id: widget.id,
        source: {
            endpoint: widget.relationId,
            itemsPath: "items",
        },
        rowKey: widget.rowKey,
        columns: widget.columns,
        ...(widget.pageSize ? { pageSize: widget.pageSize } : {}),
        ...(widget.actions?.length ? { actions: widget.actions.map(tableAction) } : {}),
    };
    const wrapper = urlSourceWrapper(relationPageUrl(widget), "dashboardData");
    const element = document.createElement("cms-dashboard-w-table");
    element.setAttribute("data-config-json", jsonAttr(tableWidget));
    element.toggleAttribute("embedded", true);
    element.append(tableRowsTemplate(tableWidget));
    appendSourceContent(wrapper, element);
    return wrapper;
}

function tableAction(action: NonNullable<RelationTableWidget["actions"]>[number]) {
    return {
        id: action.id,
        label: action.label,
        ...(action.icon ? { icon: action.icon } : {}),
        ...(action.tone ? { tone: action.tone } : {}),
        ...(action.placement ? { placement: action.placement } : {}),
    };
}

function relationPageUrl(widget: RelationTableWidget): string {
    const url = new URL(route("/api/relations/page"), window.location.origin);
    url.searchParams.set("relation", widget.relationId);
    url.searchParams.set("fromId", widget.fromId);
    url.searchParams.set("limit", String(widget.pageSize ?? 25));
    url.searchParams.set("offset", "0");
    return `${url.pathname}${url.search}`;
}
