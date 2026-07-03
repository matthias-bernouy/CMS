import type { DashboardMediaActionDetail, DashboardMediaItem } from "./w-media-field/types";

export const WIDGET_ROW_SELECT_EVENT = "cms-dashboard-widget:row-select";
export const WIDGET_BACK_EVENT = "cms-dashboard-widget:back";
export const WIDGET_ACTION_EVENT = "cms-dashboard-widget:action";
export const WIDGET_FIELD_CHANGE_EVENT = "cms-dashboard-widget:field-change";
export const WIDGET_MEDIA_ACTION_EVENT = "cms-dashboard-widget:media-action";

export type WidgetFieldValue = string | string[] | DashboardMediaItem[];

export type WidgetAction = {
    label: string;
    tone?: "primary" | "secondary" | "danger";
    action?: string;
    section?: string;
    icon?: "archive" | "download" | "link" | "trash";
};

export type WidgetRowSelectDetail = {
    collection: string;
    rowKey: string;
};

export type WidgetActionDetail = {
    action: string;
};

export type WidgetFieldChangeDetail = {
    rowKey: string;
    field: string;
    value: WidgetFieldValue;
};

export type WidgetMediaActionDetail = DashboardMediaActionDetail & {
    rowKey: string;
    field: string;
};

export function emitWidgetEvent<T>(host: HTMLElement, type: string, detail: T): void {
    host.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

export function setText(root: ParentNode, selector: string, value: string): void {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
}
