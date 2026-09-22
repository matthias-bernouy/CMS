import { composeDetailOperations } from "../actions/forms/views/operations";
import { composeMediaForms } from "../actions/forms/views/media";
import { formId } from "../actions/forms/views/composition";
import { composeLookupCreation } from "../actions/forms/views/creation";
import { composeDetail } from "../../widgets/w-detail/binding/composition";
import type { DetailSelection, RenderContext, RuntimeDetailWidget } from "../../domain";
import { DashboardWDetail } from "../../widgets/w-detail/WDetail";
import { detailReloadEvent } from "../reload";
import { requiredSourceParams, sourceWrapper } from "./mountSource";
import { navigationListElement } from "./navigation";

export function detailElement(
    widget: RuntimeDetailWidget,
    context: RenderContext,
    detail: DetailSelection | null,
): HTMLElement {
    const rowKey = detail?.row ?? "";
    const element = detailContent(widget, context, rowKey);
    attachDetailSource(element, widget, context, rowKey);
    return element;
}

export function attachDetailSource(
    element: HTMLElement,
    widget: RuntimeDetailWidget,
    context: RenderContext,
    rowKey: string,
): void {
    const wrapper = sourceWrapper(
        context.dashboard.source,
        widget.source,
        { selection: { id: rowKey === "__new__" ? undefined : rowKey } },
        "dashboardData",
        requiredSourceParams(context, widget.source),
    );
    wrapper.setAttribute(
        "cms-reload-on",
        detailReloadEvent(context.dashboard.source, context.dashboard.id, widget.id, rowKey),
    );
    for (const child of Array.from(wrapper.children)) {
        child.setAttribute("slot", "source-status");
    }
    element.append(...Array.from(wrapper.childNodes));
    element.setAttribute("cms-source", wrapper.getAttribute("cms-source") ?? "");
    element.setAttribute("cms-reload-on", wrapper.getAttribute("cms-reload-on")!);
}

function detailContent(widget: RuntimeDetailWidget, context: RenderContext, rowKey: string): HTMLElement {
    const element = new DashboardWDetail();
    element.dataset.widgetId = widget.id;
    element.id = formId();
    element.configure(widget);
    const selection = { collection: widget.id, row: rowKey };
    element.append(
        composeDetail(widget, context, (child) => navigationListElement(child, context, selection, undefined, element)),
    );
    const form = element.querySelector<HTMLFormElement>("[data-detail-save]");
    if (form && !(widget.create && rowKey === "__new__")) {
        form.setAttribute("cms-source-success-reload", `#${element.id}`);
    }
    composeLookupCreation(element, widget, context);
    composeMediaForms(element, widget, context);
    composeDetailOperations(element, widget, context);
    element.setAttribute("data-row-key", rowKey);
    element.setAttribute("data-source-id", context.dashboard.source);
    return element;
}
