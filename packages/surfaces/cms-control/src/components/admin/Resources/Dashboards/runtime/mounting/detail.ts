import type { DetailSelection, RenderContext, RuntimeDetailWidget } from "../../domain";
import "../../widgets/w-detail/WDetail";
import { detailReloadEvent } from "../reload";
import { relationDetailSectionElement } from "./mountRelations";
import { appendSourceContent, jsonAttr, requiredSourceParams, sourceWrapper } from "./mountSource";

export function detailElement(
    widget: RuntimeDetailWidget,
    context: RenderContext,
    detail: DetailSelection | null,
): HTMLElement {
    const rowKey = detail?.row ?? "";
    const directResource = matchingDetailResource(widget, context, rowKey);
    if (directResource) {
        return detailContent(widget, context, rowKey, directResource);
    }
    const wrapper = sourceWrapper(
        context.dashboard.source,
        widget.source,
        { selection: { id: rowKey } },
        "dashboardData",
        requiredSourceParams(context, widget.source),
    );
    wrapper.setAttribute(
        "cms-reload-on",
        detailReloadEvent(context.dashboard.source, context.dashboard.id, widget.id, rowKey),
    );
    const element = detailContent(widget, context, rowKey);
    element.setAttribute("data-source-json", "{{ dashboardData | json }}");
    appendSourceContent(wrapper, element);
    return wrapper;
}

function detailContent(
    widget: RuntimeDetailWidget,
    context: RenderContext,
    rowKey: string,
    directResource: NonNullable<RenderContext["detailResource"]> | null = null,
): HTMLElement {
    const element = document.createElement("cms-dashboard-w-detail");
    const config =
        directResource === null
            ? widget
            : {
                  ...widget,
                  source: { ...widget.source, itemPath: undefined },
              };
    element.setAttribute("data-config-json", jsonAttr(config));
    if (directResource !== null) {
        element.setAttribute("data-source-json", jsonAttr(directResource.resource));
    }
    element.setAttribute("data-row-key", rowKey);
    element.setAttribute("data-source-id", context.dashboard.source);
    for (const relationWidget of widget.relationWidgets ?? []) {
        element.append(relationDetailSectionElement(relationWidget));
    }
    return element;
}

function matchingDetailResource(widget: RuntimeDetailWidget, context: RenderContext, row: string) {
    const resource = context.detailResource;
    return resource &&
        resource.resource !== null &&
        resource.resource !== undefined &&
        resource.sourceId === context.dashboard.source &&
        resource.dashboardId === context.dashboard.id &&
        resource.collection === widget.id &&
        resource.row === row
        ? resource
        : null;
}
