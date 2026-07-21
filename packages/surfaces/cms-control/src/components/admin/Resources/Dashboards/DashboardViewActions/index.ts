import { showToast } from "@bernouy/components";
import { detailKey } from "../domain";
import { executeDashboardAction, executeDashboardTableAction } from "../runtime/actions";
import type { WidgetActionDetail } from "../widgets/shared";
import type { DashboardViewActionContext } from "./context";
import {
    afterTarget,
    changesPostActionSelection,
    once,
    postActionResource,
    postActionResourceTarget,
    renderResourceTarget,
    runPostActionFallback,
} from "./outcome";

export type { DashboardViewActionContext } from "./context";
export { runDashboardMediaAction } from "./media";

export async function runDashboardWidgetAction(
    context: DashboardViewActionContext,
    action: WidgetActionDetail,
): Promise<void> {
    const { group, dashboard, detail } = context;
    if (!group || !dashboard) {
        return;
    }
    const actionDetail =
        detail ?? (action.detail && action.widget ? { collection: action.widget, row: action.row ?? "" } : null);
    const key = actionDetail ? detailKey(actionDetail.collection, actionDetail.row) : "";
    const finishAction = once(context.actionCoordinator?.beginAction());
    try {
        const result = actionDetail
            ? await executeDashboardAction(
                  group,
                  dashboard,
                  actionDetail,
                  action.action,
                  {
                      ...(context.drafts.get(key) ?? {}),
                      ...(action.fields ?? {}),
                  },
                  action.resource,
                  context.groups ?? [group],
              )
            : await executeDashboardTableAction(
                  group,
                  dashboard,
                  action.action,
                  action.widget,
                  action.value,
                  context.groups ?? [group],
              );
        if (actionDetail) {
            context.drafts.delete(key);
        }
        let definitionsReloaded = false;
        if (result.invalidatesSchema && context.reloadDefinitions) {
            try {
                await context.reloadDefinitions();
                definitionsReloaded = true;
            } catch {
                showToast(`${action.action} completed, but CMS definitions could not be reloaded`, { type: "warning" });
            }
        }
        const completion = finishAction();
        if (result.kind === "download") {
            downloadBlob(result.blob, result.filename);
            showToast(`${action.action} downloaded`, { type: "success" });
            if (definitionsReloaded) {
                context.render();
            }
            return;
        }
        showToast(`${action.action} completed`, { type: "success" });
        const after = afterTarget(result.after, result.value, actionDetail);
        const resource = postActionResource(result.after, result.value);
        if (completion === "stale") {
            if (definitionsReloaded) {
                context.render();
            }
            return;
        }
        const target = postActionResourceTarget(
            result.after,
            after,
            actionDetail,
            detail,
            action.action,
            result.value,
            resource,
        );
        if (
            completion === "reuse" &&
            !result.invalidatesSchema &&
            resource.found &&
            resource.value !== null &&
            target &&
            context.setDetailResource
        ) {
            context.setDetailResource(target.collection, target.row, resource.value);
            renderResourceTarget(context, target, after, detail);
            return;
        }
        if (definitionsReloaded) {
            const restoresExplicitTarget = completion === "reload" && after !== null;
            if (
                restoresExplicitTarget ||
                changesPostActionSelection(after, detail, action.action, result.value, resource)
            ) {
                runPostActionFallback(context, after, detail, action.action, result.value, resource);
            } else {
                context.render();
            }
            return;
        }
        runPostActionFallback(context, after, detail, action.action, result.value, resource);
    } catch (error) {
        finishAction();
        showToast(error instanceof Error ? error.message : "Dashboard action failed", { type: "error" });
    }
}

function downloadBlob(blob: Blob, filename: string): void {
    if (typeof URL.createObjectURL !== "function") {
        throw new Error("Downloads are not supported in this browser");
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    if (typeof URL.revokeObjectURL === "function") {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}
