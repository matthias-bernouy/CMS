import type { DashboardField } from "@bernouy/cms-dashboards";
import type { IntegrationSettingsResponse } from "@bernouy/cms-integrations";
import { detailField } from "../../Dashboards/runtime/mapping/fields";
import { setValueAt } from "../../Dashboards/runtime/expressions";
import type { DashboardWDetail } from "../../Dashboards/widgets/w-detail/WDetail";
import "../../Dashboards/widgets/w-detail/WDetail";
import { WIDGET_ACTION_EVENT, type WidgetActionDetail } from "../../Dashboards/widgets/shared";

export function renderSettings(
    root: HTMLElement,
    fields: DashboardField[],
    settings: IntegrationSettingsResponse,
    save: (values: Record<string, unknown>) => void,
): void {
    const editor = document.createElement("cms-dashboard-w-detail") as DashboardWDetail;
    editor.data = {
        rowKey: "settings",
        eyebrow: "",
        title: "Connection",
        aside: [],
        actions: [{ label: "Save settings", action: "save-settings", tone: "primary" }],
        main: [
            { title: "Configuration", fields: fields.map((field) => detailField(field, settings.values, {}, {}, "")) },
        ],
    };
    editor.addEventListener(WIDGET_ACTION_EVENT, (event) => {
        event.stopPropagation();
        const detail = (event as CustomEvent<WidgetActionDetail>).detail;
        if (detail.action !== "save-settings") {
            return;
        }
        const values = structuredClone(settings.values);
        for (const field of fields) {
            if (detail.fields && Object.hasOwn(detail.fields, field.id)) {
                setValueAt(values, field.path, detail.fields[field.id]);
            }
        }
        save(values);
    });
    root.replaceChildren(editor);
}
