import {
    flattenDataShape,
    type Collection,
    type CollectionEndpointRef,
    type ColumnFormat,
    type ColumnSpec,
    type DashboardDto,
    type DashboardWidget,
    type FieldFormat,
    type FieldInput,
    type FieldSpec,
    type RowAction,
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
    if ("label" in widget && widget.label) return widget.label;
    if (widget.widget === "w-stat") return widget.label ?? widget.endpoint;
    if ("collection" in widget) return sentenceCase(labelFromPath(widget.collection));
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
        case "w-create":
            return renderCreate(widget, context, key);
        case "w-update":
            return renderUpdate(widget, context, key);
        case "w-delete":
            return renderDelete(widget, context);
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
    const rowAttributes = hasDetailCollectionWidget(context.dashboard.views, collection.id) && collection.rowKey
        ? rowSelectionAttributes(collection)
        : "";
    const rowActions = widget.rowActions?.length ? renderRowActions(widget.rowActions, context, collection) : "";

    return `
        <section class="panel dashboard-table">
            <cms-binding-core>
                ${filters}
                <div cms-source="${escapeAttr(url)} as data">
                    <p class="state" cms-condition="$source.loading">Loading...</p>
                    <p class="state" cms-condition="$source.error">Unable to load data.</p>
                    <div class="dashboard-table-scroll" cms-condition="$source.loaded">
                        <table class="dashboard-grid">
                            ${rowActions ? `
                                <colgroup>
                                    ${columns.map(() => "<col>").join("")}
                                    <col class="dashboard-actions-col">
                                </colgroup>
                            ` : ""}
                            <thead>
                                <tr>
                                    ${columns.map(column => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}
                                    ${rowActions ? `<th scope="col" class="dashboard-actions-head" aria-label="Actions"></th>` : ""}
                                </tr>
                            </thead>
                            <tbody>
                                <tr${rowAttributes} cms-repeat="${escapeAttr(repeatPath)} as row">
                                    ${columns.map(column => `<td>${formatBinding(column.field, column.format)}</td>`).join("")}
                                    ${rowActions ? `<td class="dashboard-actions-cell">${rowActions}</td>` : ""}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </cms-binding-core>
        </section>
    `;
}

function renderRowActions(actions: RowAction[], context: RenderContext, collection: Collection): string {
    const buttons = actions.flatMap(action => {
        const ref = collection.item?.[action.action];
        if (!ref) return [];
        const endpoint = endpointById(context.group, ref.endpoint);
        if (!endpoint) return [];
        const label = action.label || sentenceCase(action.action);
        const confirmLabel = action.confirm || action.action === "delete" ? `Confirm ${label.toLowerCase()}?` : "";
        const successMessage = action.action === "delete" ? "Deleted" : `${label} completed`;
        return `
            <button
                type="button"
                class="dashboard-action ${action.action === "delete" ? "danger" : ""}"
                data-dashboard-action
                data-dashboard-action-url="${escapeAttr(endpointUrl(context.group, ref, { rowBinding: true, rowKey: collection.rowKey }))}"
                data-dashboard-action-method="${escapeAttr(endpoint.method)}"
                data-dashboard-action-success-message="${escapeAttr(successMessage)}"
                ${confirmLabel ? `data-dashboard-action-confirm="${escapeAttr(confirmLabel)}"` : ""}
                ${action.body ? `data-dashboard-action-body="${escapeAttr(JSON.stringify(action.body))}"` : ""}
            >${escapeHtml(label)}</button>
        `;
    });
    if (!buttons.length) return "";
    return `<div class="dashboard-row-actions">${buttons.join("")}</div>`;
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
    const mediaFields = fields.filter(field => field.format === "image");
    const detailFields = fields.filter(field => field.format !== "image");
    return `
        <section class="panel dashboard-detail">
            <strong>${escapeHtml(widgetTitle(widget))}</strong>
            <cms-binding-core>
                <div cms-source="${escapeAttr(url)} as item">
                    <p class="state detail-state" cms-condition="$source.loading">Loading...</p>
                    <p class="state detail-state" cms-condition="$source.error">Unable to load item.</p>
                    <div class="dashboard-detail-body" cms-condition="$source.loaded">
                        ${mediaFields.length ? `
                            <div class="dashboard-detail-media-list">
                                ${mediaFields.map(field => renderImageField(field, context)).join("")}
                            </div>
                        ` : ""}
                        <dl class="dashboard-detail-list">
                            ${detailFields.map(field => `
                                <div>
                                    <dt>${escapeHtml(field.label)}</dt>
                                    <dd>${formatDetailBinding(field)}</dd>
                                </div>
                            `).join("")}
                        </dl>
                    </div>
                </div>
            </cms-binding-core>
        </section>
    `;
}

function renderCreate(
    widget: Extract<DashboardWidget, { widget: "w-create" }>,
    context: RenderContext,
    key: string,
): string {
    const collection = collectionById(context.dashboard, widget.collection);
    if (!collection) return renderMissing(`Unknown collection "${widget.collection}"`);

    const ref = collection.item?.create;
    if (!ref) return renderMissing(`Collection "${widget.collection}" does not declare item.create`);

    const endpoint = endpointById(context.group, ref.endpoint);
    if (!endpoint) return renderMissing(`Unknown endpoint "${ref.endpoint}"`);

    const fields = resolveWriteFields(widget.fields, endpoint);
    if (!fields.length) return renderMissing(`No writable fields for collection "${widget.collection}"`);

    const paramFields = paramFieldNames(ref);
    const url = endpointUrl(context.group, ref);
    const modalId = `dashboard-create-${safeDomId(key)}`;
    const label = writeLabel(widget, "Create");
    const submitLabel = writeSubmitLabel(widget, label);
    return `
        <section class="dashboard-create-action">
            <button type="button" data-dashboard-write-open="${escapeAttr(modalId)}">${escapeHtml(label)}</button>
        </section>
        <dialog class="dashboard-create-dialog" data-dashboard-write-dialog="${escapeAttr(modalId)}">
            <form
                class="dashboard-create"
                data-dashboard-write
                data-dashboard-url="${escapeAttr(url)}"
                data-dashboard-method="${escapeAttr(endpoint.method)}"
                data-dashboard-success-message="Created"
            >
                <div class="dashboard-create-head">
                    <strong>${escapeHtml(label)}</strong>
                    <button type="button" class="dashboard-create-close" data-dashboard-write-close>Close</button>
                </div>
                <div class="dashboard-create-fields">
                    ${fields.map(field => renderWriteField(field, paramFields.has(field.field), context)).join("")}
                </div>
                <div class="dashboard-create-actions">
                    <button type="button" class="dashboard-create-secondary" data-dashboard-write-close>Cancel</button>
                    <button type="submit">${escapeHtml(submitLabel)}</button>
                </div>
                <p class="state dashboard-create-state" data-dashboard-write-state hidden></p>
            </form>
        </dialog>
    `;
}

function renderUpdate(
    widget: Extract<DashboardWidget, { widget: "w-update" }>,
    context: RenderContext,
    key: string,
): string {
    const collection = collectionById(context.dashboard, widget.collection);
    if (!collection) return renderMissing(`Unknown collection "${widget.collection}"`);

    const action = widget.action ?? "update";
    const ref = collection.item?.[action];
    if (!ref) return renderMissing(`Collection "${widget.collection}" does not declare item.${action}`);

    const getRef = collection.item?.get;
    if (!getRef) return renderMissing(`Collection "${widget.collection}" does not declare item.get`);

    const endpoint = endpointById(context.group, ref.endpoint);
    if (!endpoint) return renderMissing(`Unknown endpoint "${ref.endpoint}"`);

    const getEndpoint = endpointById(context.group, getRef.endpoint);
    if (!getEndpoint) return renderMissing(`Unknown endpoint "${getRef.endpoint}"`);

    const selected = context.selectedRows.get(collection.id) ?? "";
    if (!selected) return "";

    const fields = resolveWriteFields(widget.fields, endpoint);
    if (!fields.length) return renderMissing(`No writable fields for collection "${widget.collection}"`);

    const paramFields = paramFieldNames(ref);
    const url = endpointUrl(context.group, ref, { selection: selected });
    const loadUrl = endpointUrl(context.group, getRef, { selection: selected });
    const modalId = `dashboard-update-${safeDomId(key)}`;
    const label = writeLabel(widget, "Edit");
    const submitLabel = writeSubmitLabel(widget, label);
    return `
        <section class="dashboard-create-action">
            <button type="button" data-dashboard-write-open="${escapeAttr(modalId)}">${escapeHtml(label)}</button>
        </section>
        <dialog class="dashboard-create-dialog" data-dashboard-write-dialog="${escapeAttr(modalId)}">
            <form
                class="dashboard-create"
                data-dashboard-write
                data-dashboard-url="${escapeAttr(url)}"
                data-dashboard-load-url="${escapeAttr(loadUrl)}"
                data-dashboard-method="${escapeAttr(endpoint.method)}"
                data-dashboard-success-message="Updated"
            >
                <div class="dashboard-create-head">
                    <strong>${escapeHtml(label)}</strong>
                    <button type="button" class="dashboard-create-close" data-dashboard-write-close>Close</button>
                </div>
                <div class="dashboard-create-fields">
                    ${fields.map(field => renderWriteField(field, paramFields.has(field.field), context, selected)).join("")}
                </div>
                <div class="dashboard-create-actions">
                    <button type="button" class="dashboard-create-secondary" data-dashboard-write-close>Cancel</button>
                    <button type="submit">${escapeHtml(submitLabel)}</button>
                </div>
                <p class="state dashboard-create-state" data-dashboard-write-state hidden></p>
            </form>
        </dialog>
    `;
}

function renderDelete(
    widget: Extract<DashboardWidget, { widget: "w-delete" }>,
    context: RenderContext,
): string {
    const collection = collectionById(context.dashboard, widget.collection);
    if (!collection) return renderMissing(`Unknown collection "${widget.collection}"`);

    const ref = collection.item?.delete;
    if (!ref) return renderMissing(`Collection "${widget.collection}" does not declare item.delete`);

    const endpoint = endpointById(context.group, ref.endpoint);
    if (!endpoint) return renderMissing(`Unknown endpoint "${ref.endpoint}"`);

    const selected = context.selectedRows.get(collection.id) ?? "";
    if (!selected) return "";

    const label = widget.label ?? "Delete";
    return `
        <section class="dashboard-delete-action">
            <button
                type="button"
                class="danger"
                data-dashboard-action
                data-dashboard-action-scope="detail-delete"
                data-dashboard-action-url="${escapeAttr(endpointUrl(context.group, ref, { selection: selected, rowKey: collection.rowKey }))}"
                data-dashboard-action-method="${escapeAttr(endpoint.method)}"
                data-dashboard-action-success-message="${escapeAttr(widget.successMessage ?? "Deleted")}"
                data-dashboard-action-confirm="${escapeAttr(widget.confirmLabel ?? "Delete this item?")}"
                ${widget.body ? `data-dashboard-action-body="${escapeAttr(JSON.stringify(widget.body))}"` : ""}
            >${escapeHtml(label)}</button>
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
    format?: FieldFormat;
    required?: boolean;
    readonly?: boolean;
    accept?: string;
    media?: CollectionEndpointRef;
    upload?: CollectionEndpointRef & { resultPath: string };
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
            return {
                field: field.field,
                label: field.label ?? labelFromPath(field.field),
                input: field.input,
                format: field.format,
                required: field.required,
                readonly: field.readonly,
                accept: field.accept,
                media: field.media,
                upload: field.upload,
            };
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
            format: inferFieldFormat(field.path),
            required: field.required,
        }));
}

function resolveWriteFields(fields: FieldSpec[] | undefined, endpoint: SourceEndpointDto): ResolvedField[] {
    if (fields?.length) return resolveFields(fields, endpoint);

    const shape = endpoint.body;
    if (!shape) return [];
    return flattenDataShape(shape)
        .filter(field => isSafeBindingPath(field.path))
        .slice(0, 12)
        .map(field => ({
            field: field.path,
            label: labelFromPath(field.path),
            input: field.input,
            format: inferFieldFormat(field.path),
            required: field.required,
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
    fieldAlias?: string;
    rowBinding?: boolean;
    rowKey?: string;
};

function endpointUrl(group: DashboardSourceGroup, ref: CollectionEndpointRef, options: EndpointUrlOptions = {}): string {
    const base = route(`/.cms/sources/${encodeURIComponent(group.source.id)}/${encodeURIComponent(ref.endpoint)}`);
    const params = Object.entries(ref.params ?? {});
    if (!params.length) return base;
    return `${base}?${params.map(([name, expr]) => `${encodeURIComponent(name)}=${paramValue(expr, options)}`).join("&")}`;
}

function paramValue(expr: string, options: EndpointUrlOptions): string {
    if (expr === "$selection") {
        if (options.rowBinding && options.rowKey && isSafeBindingPath(options.rowKey)) return `{{ row.${options.rowKey} }}`;
        return encodeURIComponent(options.selection ?? "");
    }
    if (expr.startsWith("$param.")) return `#{${expr.slice("$param.".length)}}`;
    if (expr.startsWith("$row.")) {
        const rowPath = expr.slice("$row.".length);
        if (options.selection && options.rowKey === rowPath) return encodeURIComponent(options.selection);
        return `{{ row.${rowPath} }}`;
    }
    if (expr.startsWith("$field.")) return `{{ ${options.fieldAlias ?? "item"}.${expr.slice("$field.".length)} }}`;
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

function hasDetailCollectionWidget(widgets: DashboardWidget[], collectionId: string): boolean {
    return widgets.some(widget => {
        if (widget.widget === "w-detail" || widget.widget === "w-update" || widget.widget === "w-delete") return widget.collection === collectionId;
        if (widget.widget === "w-section") return hasDetailCollectionWidget(widget.children, collectionId);
        if (widget.widget === "w-tabs") return widget.tabs.some(tab => hasDetailCollectionWidget(tab.children, collectionId));
        return false;
    });
}

function formatBinding(field: string, format: ResolvedColumn["format"]): string {
    const binding = `{{ row.${field} }}`;
    if (format === "badge") return `<span class="badge">${binding}</span>`;
    return binding;
}

function renderImageField(field: ResolvedField, context: RenderContext): string {
    const binding = field.media
        ? endpointUrl(context.group, field.media, {
            selection: context.selectedRows.values().next().value ?? "",
            fieldAlias: "item",
        })
        : `{{ item.${field.field} }}`;
    return `
        <figure class="dashboard-detail-media" cms-condition="item.${field.field}">
            <img src="${binding}" alt="">
            <figcaption>
                <span>${escapeHtml(field.label)}</span>
                <a href="${binding}" target="_blank" rel="noopener">Open image</a>
            </figcaption>
        </figure>
    `;
}

function formatDetailBinding(field: ResolvedField): string {
    const binding = `{{ item.${field.field} }}`;
    if (field.format === "url") return `<a href="${binding}" target="_blank" rel="noopener">${binding}</a>`;
    if (field.format === "badge" || field.input === "boolean") return `<span class="badge">${binding}</span>`;
    if (field.format === "date") return `<time>${binding}</time>`;
    return binding;
}

function renderWriteField(field: ResolvedField, isParam: boolean, context: RenderContext, selection = ""): string {
    const uploadEndpoint = field.upload ? endpointById(context.group, field.upload.endpoint) : null;
    const attrs = [
        `name="${escapeAttr(field.field)}"`,
        "data-dashboard-field",
        `data-dashboard-field-type="${escapeAttr(field.input ?? "text")}"`,
        `data-dashboard-field-label="${escapeAttr(field.label)}"`,
        isParam ? "data-dashboard-param" : "",
        field.required ? "required" : "",
        field.readonly ? "data-dashboard-readonly" : "",
        field.readonly ? "disabled" : "",
        field.upload ? `data-dashboard-upload-url="${escapeAttr(endpointUrl(context.group, field.upload, { selection }))}"` : "",
        field.upload ? `data-dashboard-upload-method="${escapeAttr(uploadEndpoint?.method ?? "POST")}"` : "",
        field.upload ? `data-dashboard-upload-result-path="${escapeAttr(field.upload.resultPath)}"` : "",
    ].filter(Boolean).join(" ");

    if (field.input === "cms-user") {
        return `
            <div class="dashboard-user-picker" ${attrs} data-dashboard-user-picker>
                <label>${escapeHtml(field.label)}</label>
                <div class="dashboard-user-control">
                    <input
                        type="search"
                        placeholder="Search by name or email"
                        autocomplete="off"
                        role="combobox"
                        aria-expanded="false"
                        data-dashboard-user-search
                    >
                    <div class="dashboard-user-menu" role="listbox" data-dashboard-user-menu hidden></div>
                </div>
            </div>
        `;
    }

    if (field.input === "boolean") {
        return `
            <label class="dashboard-checkbox">
                <input type="checkbox" ${attrs}>
                <span>${escapeHtml(field.label)}</span>
            </label>
        `;
    }

    if (field.input === "file") {
        return `
            <label class="dashboard-file-field">
                <span class="dashboard-file-label">${escapeHtml(field.label)}</span>
                <span class="dashboard-file-control">
                    <span class="dashboard-file-button">Choose file</span>
                    <span class="dashboard-file-name" data-dashboard-file-name>No file selected</span>
                </span>
                <input class="dashboard-file-input" type="file" ${attrs} ${field.accept ? `accept="${escapeAttr(field.accept)}"` : ""}>
            </label>
        `;
    }

    return `
        <p9r-input
            ${attrs}
            label="${escapeAttr(field.label)}"
            type="${escapeAttr(inputTypeFor(field))}"
        ></p9r-input>
    `;
}

function inputTypeFor(field: ResolvedField): string {
    if (field.input === "number") return "number";
    if (field.format === "url") return "url";
    return "text";
}

function paramFieldNames(ref: CollectionEndpointRef): Set<string> {
    const names = new Set<string>();
    for (const expr of Object.values(ref.params ?? {})) {
        if (expr.startsWith("$param.")) names.add(expr.slice("$param.".length));
    }
    return names;
}

function writeLabel(widget: Extract<DashboardWidget, { widget: "w-create" | "w-update" }>, fallback: string): string {
    return widget.label ?? fallback;
}

function writeSubmitLabel(widget: Extract<DashboardWidget, { widget: "w-create" | "w-update" }>, fallback: string): string {
    return widget.submitLabel ?? widget.label ?? fallback;
}

function safeDomId(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function inferFieldFormat(field: string): FieldFormat | undefined {
    const leaf = field.split(".").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    if (leaf.endsWith("url") || leaf.endsWith("uri") || leaf === "href") return "url";
    if (leaf.endsWith("at") || leaf.endsWith("date")) return "date";
    return undefined;
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
