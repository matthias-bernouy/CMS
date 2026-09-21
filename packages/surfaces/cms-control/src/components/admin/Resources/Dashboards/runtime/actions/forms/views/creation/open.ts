import { readSourceData, reloadSource, showToast } from "@bernouy/components";
import { CMS_SOURCE_SUCCESS_EVENT } from "@bernouy/components/binding";
import type { DashboardDetailOpenRef } from "@bernouy/cms-dashboards";
import type { RenderContext } from "../../../../../domain";
import { detailElement } from "../../../../mounting/detail";
import { valueAt } from "../../../../expressions";
import { WIDGET_BACK_EVENT, WIDGET_ROW_SELECT_EVENT, emitWidgetEvent } from "../../../../../widgets/shared";
import { formPart } from "../composition";
import { DETAIL_SAVED_EVENT, type DetailSaved } from "../detail";
import type { DashboardWDetail } from "../../../../../widgets/w-detail/WDetail";
import { resolveDetailView } from "./resolve";

type Options = { row?: string; saved?: (resource: unknown) => void };

export function openDetailView(
    owner: HTMLElement,
    ref: DashboardDetailOpenRef,
    context: RenderContext,
    options: Options = {},
): void {
    try {
        const target = resolveDetailView(ref, context);
        if (!options.row && !target.widget.create) {
            throw new Error("This detail does not support creation.");
        }
        const row = options.row ?? "__new__";
        if (ref.presentation === "page") {
            emitWidgetEvent(owner, WIDGET_ROW_SELECT_EVENT, {
                collection: target.widget.id,
                rowKey: row,
                dashboard: target.context.dashboard.id,
                source: target.context.dashboard.source,
            });
            return;
        }
        const modal = formPart<HTMLElement>("detail-modal");
        modal.slot = "footer";
        modal.setAttribute("aria-label", ref.title ?? ref.label ?? target.widget.title?.fallback ?? "Resource details");
        const detail = detailElement(target.widget, target.context, {
            collection: target.widget.id,
            row,
        }) as DashboardWDetail;
        detail.setAttribute("presentation", "modal");
        modal.append(detail);
        let completed = false;
        const close = () => (modal as HTMLElement & { hide(): void }).hide();
        modal.addEventListener("beforeclose", (event) => {
            if (event.target !== modal || completed) {
                return;
            }
            if (
                detail.getAttribute("aria-busy") === "true" ||
                detail.querySelector('[data-detail-save][aria-busy="true"]')
            ) {
                event.preventDefault();
                return;
            }
            if (detail.hasUnsavedChanges() && !window.confirm("Discard the unsaved changes?")) {
                event.preventDefault();
            }
        });
        modal.addEventListener(DETAIL_SAVED_EVENT, (event) => {
            if (event.target !== detail) {
                return;
            }
            event.stopPropagation();
            const data = readSourceData(detail);
            const saved = (event as CustomEvent<DetailSaved>).detail;
            const resource = saved.created
                ? saved.body
                : target.widget.source.itemPath
                  ? valueAt(data, target.widget.source.itemPath)
                  : data;
            options.saved?.(resource);
            completed = true;
            close();
            if (!options.saved) {
                const read = owner.hasAttribute("cms-source")
                    ? owner
                    : owner.querySelector<HTMLElement>("[cms-source]");
                if (read) {
                    void reloadSource(read).catch(() =>
                        showToast("Reload the list to see the saved resource.", { type: "warning" }),
                    );
                }
            }
        });
        modal.addEventListener(WIDGET_BACK_EVENT, (event) => {
            event.stopPropagation();
            close();
        });
        for (const type of [
            "cms-dashboard-widget:field-change",
            WIDGET_ROW_SELECT_EVENT,
            "cms-dashboard-widget:media-action",
            "cms-dashboard-widget:action",
            CMS_SOURCE_SUCCESS_EVENT,
        ]) {
            modal.addEventListener(type, (event) => event.stopPropagation());
        }
        modal.addEventListener("close", (event) => {
            if (event.target === modal) {
                modal.remove();
            }
        });
        owner.append(modal);
        modal.setAttribute("open", "");
    } catch (error) {
        showToast(error instanceof Error ? error.message : "The detail could not be opened.", { type: "error" });
    }
}
