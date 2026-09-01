import type { DashboardWidget } from "@bernouy/cms-dashboards";
import type { DetailSelection, RenderContext } from "../../domain";
import "../../widgets/w-navigation-list/WNavigationList";
import {
    appendSourceContent,
    jsonAttr,
    navigationItemsTemplate,
    requiredSourceParams,
    sourceWrapper,
} from "./mountSource";

export function navigationListElement(
    widget: Extract<DashboardWidget, { widget: "w-navigation-list" }>,
    context: RenderContext,
    detail: DetailSelection | null,
    slot?: string,
): HTMLElement {
    const wrapper = sourceWrapper(
        context.dashboard.source,
        widget.source,
        selectionVars(detail),
        "dashboardData",
        requiredSourceParams(context, widget.source),
    );
    if (slot) {
        wrapper.setAttribute("slot", slot);
    }
    const element = document.createElement("cms-dashboard-w-navigation-list");
    element.setAttribute("data-config-json", jsonAttr(widget));
    element.append(navigationItemsTemplate(widget));
    appendSourceContent(wrapper, element);
    return wrapper;
}

export function selectionVars(detail: DetailSelection | null): { selection?: Record<string, unknown> } {
    if (!detail) {
        return {};
    }
    const selected = { id: detail.row };
    return {
        selection: {
            ...selected,
            [detail.collection]: selected,
        },
    };
}
