import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { route } from "../api";
import { resolveParams, type RuntimeVars } from "./expressions";

export function sourceWrapper(
    sourceId: string,
    ref: { sourceId?: string; endpoint: string; params?: Record<string, string> },
    vars: RuntimeVars,
    alias: string,
): HTMLElement {
    return urlSourceWrapper(sourceUrl(sourceId, ref, vars), alias);
}

export function urlSourceWrapper(url: string, alias: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("cms-source", `${url} as ${alias}`);
    wrapper.append(sourceLoadingState(), sourceErrorState());
    wrapper.addEventListener("click", retrySource);
    return wrapper;
}

export function appendSourceContent(wrapper: HTMLElement, content: HTMLElement): void {
    content.setAttribute("cms-condition", "$source.loaded || $source.empty");
    wrapper.append(content);
}

export function jsonAttr(value: unknown): string {
    return JSON.stringify(value);
}

export function tableRowsTemplate(widget: Extract<DashboardWidget, { widget: "w-table" }>): HTMLElement {
    const row = document.createElement("cms-dashboard-w-row");
    row.setAttribute("cms-repeat", `${repeatPath("dashboardData", widget.source.itemsPath)} as row`);
    row.setAttribute("row-key", bindingPath("row", widget.rowKey));
    if (widget.selection?.opens) row.setAttribute("collection", widget.selection.opens);
    for (const column of widget.columns) {
        const cell = document.createElement("cms-dashboard-w-cell");
        cell.setAttribute("column", column.id);
        if (column.primary) cell.toggleAttribute("primary", true);
        if (column.primary) cell.setAttribute("meta", "{{ row.id }}");
        if (column.format === "badge") cell.setAttribute("tone", "badge");
        cell.textContent = bindingPath("row", column.path);
        row.append(cell);
    }
    return row;
}

export function navigationItemsTemplate(widget: Extract<DashboardWidget, { widget: "w-navigation-list" }>): HTMLElement {
    const item = document.createElement("cms-dashboard-w-navigation-item");
    item.setAttribute("cms-repeat", `${repeatPath("dashboardData", widget.source.itemsPath)} as row`);
    item.setAttribute("row-key", bindingPath("row", widget.rowKey));
    item.setAttribute("title", bindingPath("row", widget.item.title.path));
    if (widget.item.subtitle) item.setAttribute("subtitle", bindingPath("row", widget.item.subtitle.path));
    if (widget.item.icon) item.setAttribute("icon", widget.item.icon);
    if (widget.item.badge) item.setAttribute("badge", bindingPath("row", widget.item.badge.path));
    if (widget.selection?.opens) item.setAttribute("collection", widget.selection.opens);
    if (widget.reorderable) item.toggleAttribute("reorderable", true);
    return item;
}

function sourceUrl(
    sourceId: string,
    ref: { sourceId?: string; endpoint: string; params?: Record<string, string> },
    vars: RuntimeVars,
): string {
    const targetSourceId = ref.sourceId ?? sourceId;
    const url = new URL(route(`/.cms/sources/${encodeURIComponent(targetSourceId)}/${encodeURIComponent(ref.endpoint)}`), window.location.origin);
    for (const [key, value] of Object.entries(resolveParams(ref.params, vars))) url.searchParams.set(key, value);
    return `${url.pathname}${url.search}`;
}

function repeatPath(alias: string, path: string | undefined): string {
    return path ? `${alias}.${path}` : alias;
}

function bindingPath(alias: string, path: string): string {
    return `{{ ${path === "." ? alias : `${alias}.${path}`} }}`;
}

function sourceLoadingState(): HTMLElement {
    const state = document.createElement("div");
    state.className = "dashboard-source-state dashboard-source-loading";
    state.setAttribute("cms-condition", "$source.loading");
    state.setAttribute("role", "status");
    state.textContent = "Loading data…";
    return state;
}

function sourceErrorState(): HTMLElement {
    const state = document.createElement("div");
    state.className = "dashboard-source-state dashboard-source-error";
    state.setAttribute("cms-condition", "$source.error");
    state.setAttribute("role", "alert");

    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Unable to load this data";
    const message = document.createElement("span");
    message.textContent = "Nothing can be changed until the data is available.";
    const detail = document.createElement("small");
    detail.textContent = "{{ $source.message }}";
    copy.append(title, message, detail);

    const retry = document.createElement("button");
    retry.type = "button";
    retry.dataset.dashboardSourceRetry = "true";
    retry.textContent = "Retry";
    state.append(copy, retry);
    return state;
}

function retrySource(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-dashboard-source-retry]")) return;
    target.ownerDocument.dispatchEvent(new Event("cms-source:reload"));
}
