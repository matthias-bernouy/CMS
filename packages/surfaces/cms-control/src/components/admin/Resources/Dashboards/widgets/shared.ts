import type { DashboardMediaActionDetail, DashboardMediaItem } from "./w-media-field/types";

export const WIDGET_ROW_SELECT_EVENT = "cms-dashboard-widget:row-select";
export const WIDGET_BACK_EVENT = "cms-dashboard-widget:back";
export const WIDGET_ACTION_EVENT = "cms-dashboard-widget:action";
export const WIDGET_FILTER_CHANGE_EVENT = "cms-dashboard-widget:filter-change";
export const WIDGET_FIELD_CHANGE_EVENT = "cms-dashboard-widget:field-change";
export const WIDGET_MEDIA_ACTION_EVENT = "cms-dashboard-widget:media-action";

export type WidgetFieldValue = string | boolean | string[] | DashboardMediaItem[];

export type WidgetAction = {
    label: string;
    tone?: "primary" | "secondary" | "danger";
    placement?: "primary" | "secondary" | "more";
    action?: string;
    section?: string;
    icon?: "archive" | "download" | "link" | "trash";
    confirm?: string;
};

export type WidgetRowSelectDetail = {
    collection: string;
    rowKey: string;
};

export type WidgetActionDetail = {
    action: string;
    detail?: boolean;
    widget?: string;
    row?: string;
    target?: string;
    resource?: unknown;
    fields?: Record<string, unknown>;
    value?: unknown;
};

export type WidgetFilterChangeDetail = {
    widget: string;
    filters: Record<string, string>;
};

export type WidgetFieldChangeDetail = {
    rowKey: string;
    field: string;
    value: WidgetFieldValue;
    created?: boolean;
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
    if (element) {
        element.textContent = value;
    }
}

export function setP9rButtonLabel(button: HTMLElement, label: string): void {
    button.textContent = label;
    button.setAttribute("aria-label", label);
    const syncNativeButton = (): void => {
        button.shadowRoot?.querySelector("button")?.setAttribute("aria-label", label);
    };
    syncNativeButton();
    if (!button.shadowRoot) {
        void customElements.whenDefined(button.localName).then(syncNativeButton);
    }
}

export function setP9rButtonTone(button: HTMLElement, tone: WidgetAction["tone"]): void {
    button.removeAttribute("color");
    button.removeAttribute("variant");

    if (tone === "primary") {
        button.setAttribute("color", "primary");
        button.setAttribute("variant", "filled");
        return;
    }
    if (tone === "danger") {
        button.setAttribute("color", "danger");
        button.setAttribute("variant", "ghost");
        return;
    }
    button.setAttribute("variant", "outlined");
}
