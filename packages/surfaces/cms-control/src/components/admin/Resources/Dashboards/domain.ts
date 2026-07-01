import {
    flattenDataShape,
    type Collection,
    type CollectionEndpointRef,
    type ColumnFormat,
    type ColumnSpec,
    type DashboardDto,
    type DashboardWidget,
    type FieldInput,
    type FieldSpec,
} from "@bernouy/cms-dashboards";
import type { DataShape, EndpointResponse, SourceEndpointDto } from "@bernouy/cms-sources";
import { route } from "./api";
import type { DashboardSourceGroup } from "./types";

export type RenderContext = {
    group: DashboardSourceGroup;
    dashboard: DashboardDto;
    selectedRows: ReadonlyMap<string, string>;
};

export function endpointById(group: DashboardSourceGroup, endpointId: string): SourceEndpointDto | null {
    return group.endpoints.find(endpoint => endpoint.endpointId === endpointId) ?? null;
}

export function collectionById(dashboard: DashboardDto, collectionId: string): Collection | null {
    return dashboard.collections.find(collection => collection.id === collectionId) ?? null;
}

export function widgetTitle(widget: DashboardWidget): string {
    if (widget.widget === "w-stat") return widget.label ?? widget.endpoint;
    if ("collection" in widget) return widget.collection;
    if (widget.widget === "w-section") return widget.title ?? "Section";
    return widget.widget;
}

const SAFE_BINDING_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

export function renderWidget(widget: DashboardWidget, context: RenderContext, key: string, tabState: Map<string, number>): string {
    switch (widget.widget) {
        case "w-section":
            return renderSection(widget, context, key, tabState);
        case "w-tabs":
            return renderTabs(widget, context, key, tabState);
        case "w-table":
            return renderTable(widget, context);
        case "w-stat":
            return renderStat(widget, context);
        case "w-detail":
            return renderDetail(widget, context);
        case "w-detail-item-put":
        case "w-detail-patch":
        case "w-create":
            return renderPendingWidget(widget);
        default:
            return `<section class="panel empty"><strong>Unsupported widget</strong></section>`;
    }
}

function renderSection(
    widget: Extract<DashboardWidget, { widget: "w-section" }>,
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
): string {
    return `
        <section class="widget-section">
            ${widget.title ? `<h3>${escapeHtml(widget.title)}</h3>` : ""}
            <div class="widget-stack">
                ${widget.children.map((child, index) => renderWidget(child, context, `${key}.${index}`, tabState)).join("")}
            </div>
        </section>
    `;
}

function renderTabs(
    widget: Extract<DashboardWidget, { widget: "w-tabs" }>,
    context: RenderContext,
    key: string,
    tabState: Map<string, number>,
): string {
    const activeIndex = Math.min(tabState.get(key) ?? 0, Math.max(widget.tabs.length - 1, 0));
    const active = widget.tabs[activeIndex];
    return `
        <section class="tabs-panel">
            <div class="tabs" role="tablist">
                ${widget.tabs.map((tab, index) => `
                    <button class="tab ${index === activeIndex ? "active" : ""}" type="button" data-tab-key="${escapeAttr(key)}" data-tab-index="${index}">
                        ${escapeHtml(tab.label)}
                    </button>
                `).join("")}
            </div>
            <div class="tab-body">
                ${active ? active.children.map((child, index) => renderWidget(child, context, `${key}.${activeIndex}.${index}`, tabState)).join("") : ""}
            </div>
        </section>
    `;
}

function renderTable(
    widget: Extract<DashboardWidget, { widget: "w-table" }>,
    context: RenderContext,
): string {
    const collection = collectionById(context.dashboard, widget.collection);
    if (!collection) return renderMissing(`Unknown collection "${widget.collection}"`);
    const endpoint = endpointById(context.group, collection.list.endpoint);
    if (!endpoint) return renderMissing(`Unknown endpoint "${collection.list.endpoint}"`);

    const columns = resolveColumns(widget.columns, endpoint, collection);
    if (!columns.length) return renderMissing(`No displayable columns for collection "${widget.collection}"`);
    const repeatPath = repeatPathFor(endpoint, collection);
    const url = endpointUrl(context.group, collection.list);
    const filters = renderFilters(widget, collection);
    const rowAttributes = hasDetailWidget(context.dashboard.views, collection.id) && collection.item?.get
        ? rowSelectionAttributes(collection)
        : "";

    return `
        <section class="panel dashboard-table">
            <cms-binding-core>
                ${filters}
                <div cms-source="${escapeAttr(url)} as data">
                    <p class="state" cms-condition="$source.loading">Loading...</p>
                    <p class="state" cms-condition="$source.error">Unable to load data.</p>
                    <div class="dashboard-table-scroll" cms-condition="$source.loaded">
                        <table class="dashboard-grid">
                            <thead>
                                <tr>
                                    ${columns.map(column => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}
                                </tr>
                            </thead>
                            <tbody>
                                <tr${rowAttributes} cms-repeat="${escapeAttr(repeatPath)} as row">
                                    ${columns.map(column => `<td>${formatBinding(column.field, column.format)}</td>`).join("")}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </cms-binding-core>
        </section>
    `;
}

function renderDetail(
    widget: Extract<DashboardWidget, { widget: "w-detail" }>,
    context: RenderContext,
): string {
    const collection = collectionById(context.dashboard, widget.collection);
    if (!collection) return renderMissing(`Unknown collection "${widget.collection}"`);

    const ref = collection.item?.get;
    if (!ref) return renderMissing(`Collection "${widget.collection}" does not declare item.get`);

    const endpoint = endpointById(context.group, ref.endpoint);
    if (!endpoint) return renderMissing(`Unknown endpoint "${ref.endpoint}"`);

    const selected = context.selectedRows.get(collection.id) ?? "";
    if (!selected) {
        return `
            <section class="panel empty dashboard-detail">
                <strong>${escapeHtml(widgetTitle(widget))}</strong>
                <span>Select a row to view its details.</span>
            </section>
        `;
    }

    const fields = resolveFields(widget.fields, endpoint);
    if (!fields.length) return renderMissing(`No displayable fields for collection "${widget.collection}"`);

    const url = endpointUrl(context.group, ref, { selection: selected });
    return `
        <section class="panel dashboard-detail">
            <strong>${escapeHtml(widgetTitle(widget))}</strong>
            <cms-binding-core>
                <div cms-source="${escapeAttr(url)} as item">
                    <p class="state detail-state" cms-condition="$source.loading">Loading...</p>
                    <p class="state detail-state" cms-condition="$source.error">Unable to load item.</p>
                    <dl class="dashboard-detail-grid" cms-condition="$source.loaded">
                        ${fields.map(field => `
                            <div>
                                <dt>${escapeHtml(field.label)}</dt>
                                <dd>${formatDetailBinding(field.field, field.input)}</dd>
                            </div>
                        `).join("")}
                    </dl>
                </div>
            </cms-binding-core>
        </section>
    `;
}

function renderStat(widget: Extract<DashboardWidget, { widget: "w-stat" }>, context: RenderContext): string {
    const endpoint = endpointById(context.group, widget.endpoint);
    if (!endpoint) return renderMissing(`Unknown endpoint "${widget.endpoint}"`);
    if (!isSafeBindingPath(widget.path)) return renderMissing(`Invalid stat path "${widget.path}"`);
    const url = endpointUrl(context.group, { endpoint: widget.endpoint });
    return `
        <cms-binding-core>
            <section class="stat" cms-source="${escapeAttr(url)} as data">
                <span>${escapeHtml(widget.label ?? widget.endpoint)}</span>
                <strong cms-condition="$source.loaded">{{ data.${widget.path} }}</strong>
                <strong cms-condition="$source.loading">...</strong>
                <strong cms-condition="$source.error">-</strong>
            </section>
        </cms-binding-core>
    `;
}

function renderPendingWidget(widget: DashboardWidget): string {
    return `
        <section class="panel empty">
            <strong>${escapeHtml(widgetTitle(widget))}</strong>
            <span>${escapeHtml(widget.widget)} will be enabled with the write/detail phase.</span>
        </section>
    `;
}

function renderMissing(message: string): string {
    return `<section class="panel empty"><strong>Invalid dashboard</strong><span>${escapeHtml(message)}</span></section>`;
}

function renderFilters(widget: Extract<DashboardWidget, { widget: "w-table" }>, collection: Collection): string {
    if (!widget.filters?.length) return "";
    return `
        <div class="dashboard-filters" role="search" aria-label="Dashboard filters">
            ${widget.filters.map(filter => {
                const param = filter.param ?? filter.field;
                const label = filter.label ?? filterLabel(filter.field);
                if (filter.input === "select") {
                    return `
                        <p9r-select cms-param-sync="${escapeAttr(param)}" label="${escapeAttr(label)}" value="">
                            <option value="">All</option>
                            ${(filter.options ?? []).map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}
                        </p9r-select>
                    `;
                }
                return `
                    <p9r-input
                        cms-param-sync="${escapeAttr(param)}"
                        label="${escapeAttr(label)}"
                        placeholder="${escapeAttr(filter.placeholder ?? filterPlaceholder(filter.field, collection))}"
                        type="search"
                    ></p9r-input>
                `;
            }).join("")}
        </div>
    `;
}

type ResolvedColumn = {
    field: string;
    label: string;
    format?: ColumnFormat;
};

type ResolvedField = {
    field: string;
    label: string;
    input?: FieldInput;
};

function resolveColumns(
    columns: ColumnSpec[] | undefined,
    endpoint: SourceEndpointDto,
    collection: Collection,
): ResolvedColumn[] {
    if (columns?.length) {
        return columns.flatMap(column => {
            if (typeof column === "string") return isSafeBindingPath(column) ? { field: column, label: labelFromPath(column) } : [];
            if (!isSafeBindingPath(column.field)) return [];
            return { field: column.field, label: column.label ?? labelFromPath(column.field), format: column.format };
        });
    }

    const itemShape = listItemShape(endpoint, collection);
    if (!itemShape) return [];
    return flattenDataShape(itemShape)
        .filter(field => isSafeBindingPath(field.path))
        .slice(0, 8)
        .map(field => ({
            field: field.path,
            label: labelFromPath(field.path),
            format: field.input === "number" ? "text" : "text",
        }));
}

function resolveFields(fields: FieldSpec[] | undefined, endpoint: SourceEndpointDto): ResolvedField[] {
    if (fields?.length) {
        return fields.flatMap(field => {
            if (typeof field === "string") return isSafeBindingPath(field) ? { field, label: labelFromPath(field) } : [];
            if (!isSafeBindingPath(field.field)) return [];
            return { field: field.field, label: field.label ?? labelFromPath(field.field), input: field.input };
        });
    }

    const shape = detailShape(endpoint);
    if (!shape) return [];
    return flattenDataShape(shape)
        .filter(field => isSafeBindingPath(field.path))
        .slice(0, 12)
        .map(field => ({
            field: field.path,
            label: labelFromPath(field.path),
            input: field.input,
        }));
}

function listItemShape(endpoint: SourceEndpointDto, collection: Collection): DataShape | null {
    const body = successBody(endpoint);
    if (!body) return null;
    const listShape = collection.list.itemsPath ? shapeAtPath(body, collection.list.itemsPath) : defaultListShape(body);
    if (!listShape) return null;
    if (listShape.type === "array") return listShape.items ?? null;
    return listShape;
}

function detailShape(endpoint: SourceEndpointDto): DataShape | null {
    const body = successBody(endpoint);
    if (!body) return null;
    if (body.type === "array") return body.items ?? null;
    return body;
}

function repeatPathFor(endpoint: SourceEndpointDto, collection: Collection): string {
    if (collection.list.itemsPath) return `data.${collection.list.itemsPath}`;
    const body = successBody(endpoint);
    if (body?.type === "object" && body.properties?.items?.type === "array") return "data.items";
    return "data";
}

function defaultListShape(body: DataShape): DataShape {
    if (body.type === "object" && body.properties?.items?.type === "array") return body.properties.items;
    return body;
}

function successBody(endpoint: SourceEndpointDto): DataShape | null {
    const output = endpoint.output ?? [];
    return (
        output.find(isSuccessResponse)?.body ??
        output.find(response => response.status === "default")?.body ??
        output.find(response => response.body)?.body ??
        null
    );
}

function isSuccessResponse(response: EndpointResponse): boolean {
    const status = Number(response.status);
    return Number.isInteger(status) && status >= 200 && status < 300 && Boolean(response.body);
}

function shapeAtPath(shape: DataShape, path: string): DataShape | null {
    let current: DataShape | undefined = shape;
    for (const part of path.split(".")) {
        if (!part) return null;
        if (current?.type === "array") current = current.items;
        if (current?.type !== "object") return null;
        current = current.properties?.[part];
    }
    return current ?? null;
}

type EndpointUrlOptions = {
    selection?: string;
};

function endpointUrl(group: DashboardSourceGroup, ref: CollectionEndpointRef, options: EndpointUrlOptions = {}): string {
    const base = route(`/.cms/sources/${encodeURIComponent(group.source.id)}/${encodeURIComponent(ref.endpoint)}`);
    const params = Object.entries(ref.params ?? {});
    if (!params.length) return base;
    return `${base}?${params.map(([name, expr]) => `${encodeURIComponent(name)}=${paramValue(expr, options)}`).join("&")}`;
}

function paramValue(expr: string, options: EndpointUrlOptions): string {
    if (expr === "$selection") return encodeURIComponent(options.selection ?? "");
    if (expr.startsWith("$param.")) return `#{${expr.slice("$param.".length)}}`;
    if (expr.startsWith("$row.")) return `{{ row.${expr.slice("$row.".length)} }}`;
    return encodeURIComponent(expr);
}

function rowSelectionAttributes(collection: Collection): string {
    const rowKey = collection.rowKey;
    if (!rowKey || !isSafeBindingPath(rowKey)) return "";
    return [
        " class=\"dashboard-row\"",
        " role=\"button\"",
        " tabindex=\"0\"",
        ` aria-label="Select ${escapeAttr(labelFromPath(collection.id))}"`,
        ` data-dashboard-collection="${escapeAttr(collection.id)}"`,
        ` data-dashboard-row-key="{{ row.${rowKey} }}"`,
    ].join("");
}

function hasDetailWidget(widgets: DashboardWidget[], collectionId: string): boolean {
    return widgets.some(widget => {
        if (widget.widget === "w-detail") return widget.collection === collectionId;
        if (widget.widget === "w-section") return hasDetailWidget(widget.children, collectionId);
        if (widget.widget === "w-tabs") return widget.tabs.some(tab => hasDetailWidget(tab.children, collectionId));
        return false;
    });
}

function formatBinding(field: string, format: ResolvedColumn["format"]): string {
    const binding = `{{ row.${field} }}`;
    if (format === "badge") return `<span class="badge">${binding}</span>`;
    return binding;
}

function formatDetailBinding(field: string, input: ResolvedField["input"]): string {
    const binding = `{{ item.${field} }}`;
    if (input === "boolean") return `<span class="badge">${binding}</span>`;
    return binding;
}

function isSafeBindingPath(path: string): boolean {
    return SAFE_BINDING_PATH.test(path);
}

function labelFromPath(path: string): string {
    const leaf = path.split(".").filter(Boolean).at(-1) ?? path;
    return leaf.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function filterLabel(field: string): string {
    if (field === "q") return "Search";
    return sentenceCase(labelFromPath(field));
}

function filterPlaceholder(field: string, collection: Collection): string {
    if (field === "q") return `Search ${labelFromPath(collection.id).toLowerCase()}`;
    return `Filter by ${filterLabel(field).toLowerCase()}`;
}

function sentenceCase(value: string): string {
    return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => HTML_ESCAPE[char] ?? char);
}

function escapeAttr(value: string): string {
    return escapeHtml(value);
}

const HTML_ESCAPE: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
