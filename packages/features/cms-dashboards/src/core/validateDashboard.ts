import { makeEndpointUrn, makeSourceUrn, type Source, type SourceEndpoint } from "@bernouy/cms-sources";
import type {
    DashboardAction,
    DashboardBinding,
    DashboardColumn,
    DashboardDataRef,
    DashboardDto,
    DashboardEndpointRef,
    DashboardField,
    DashboardFilter,
    DashboardLookupCreate,
    DashboardLookupRef,
    DashboardOption,
    DashboardSection,
    DashboardVisibilityRule,
    DashboardWidget,
} from "../interfaces/Dashboard";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
const PARAM_EXPR = /^\$(row|resource|field|filter|param|selection|search|value|input|user|media)(\.[A-Za-z_$][\w$]*)*$/;

export type ValidateDashboardOptions = {
    source?: Source | null;
};

export function validateDashboard(dashboard: DashboardDto, options: ValidateDashboardOptions = {}): string[] {
    const errors: string[] = [];
    const source = options.source ?? null;

    validateRequiredId("dashboard.id", dashboard.id, errors);
    validateRequiredId("dashboard.source", dashboard.source, errors);
    if (source && source.urn !== makeSourceUrn(dashboard.source)) {
        errors.push(`dashboard source "${dashboard.source}" does not match source "${source.urn}"`);
    }
    if (!Array.isArray(dashboard.views) || dashboard.views.length === 0) {
        errors.push("views must contain at least one widget");
        return errors;
    }

    const widgetIds = new Set<string>();
    collectWidgetIds(dashboard.views, "views", widgetIds, errors);
    dashboard.views.forEach((widget, index) =>
        validateWidget(widget, `views.${index}`, dashboard, source, widgetIds, errors));
    return errors;
}

function collectWidgetIds(
    widgets: DashboardWidget[],
    path: string,
    widgetIds: Set<string>,
    errors: string[],
): void {
    widgets.forEach((widget, index) => {
        const widgetPath = `${path}.${index}`;
        validateRequiredId(`${widgetPath}.id`, widget.id, errors);
        if (widget.id) {
            if (widgetIds.has(widget.id)) errors.push(`duplicate widget id "${widget.id}"`);
            widgetIds.add(widget.id);
        }
        if (widget.widget === "w-section") {
            collectWidgetIds(widget.children, `${widgetPath}.children`, widgetIds, errors);
        } else if (widget.widget === "w-tabs") {
            widget.tabs.forEach((tab, tabIndex) =>
                collectWidgetIds(tab.children, `${widgetPath}.tabs.${tabIndex}.children`, widgetIds, errors));
        }
    });
}

function validateWidget(
    widget: DashboardWidget,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    switch ((widget as { widget?: string }).widget) {
        case "w-table":
            validateTableWidget(widget as Extract<DashboardWidget, { widget: "w-table" }>, path, dashboard, source, widgetIds, errors);
            break;
        case "w-detail":
            validateDetailWidget(widget as Extract<DashboardWidget, { widget: "w-detail" }>, path, dashboard, source, errors);
            break;
        case "w-section":
            validateSectionWidget(widget as Extract<DashboardWidget, { widget: "w-section" }>, path, dashboard, source, widgetIds, errors);
            break;
        case "w-tabs":
            validateTabsWidget(widget as Extract<DashboardWidget, { widget: "w-tabs" }>, path, dashboard, source, widgetIds, errors);
            break;
        default:
            errors.push(`${path}.widget is not supported`);
    }
}

function validateTableWidget(
    widget: Extract<DashboardWidget, { widget: "w-table" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    validateDataRef(dashboard, widget.source, `${path}.source`, source, errors);
    validateRequiredPath("rowKey", widget.rowKey, path, errors);
    if (!Array.isArray(widget.columns) || widget.columns.length === 0) {
        errors.push(`${path}.columns must contain at least one column`);
    } else {
        widget.columns.forEach((column, index) => validateColumn(column, `${path}.columns.${index}`, errors));
    }
    widget.filters?.forEach((filter, index) => validateFilter(filter, `${path}.filters.${index}`, errors));
    if (widget.pageSize !== undefined && (!Number.isInteger(widget.pageSize) || widget.pageSize < 1)) {
        errors.push(`${path}.pageSize must be a positive integer`);
    }
    if (widget.selection?.opens && !widgetIds.has(widget.selection.opens)) {
        errors.push(`${path}.selection.opens references unknown widget "${widget.selection.opens}"`);
    }
}

function validateDetailWidget(
    widget: Extract<DashboardWidget, { widget: "w-detail" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validateDataRef(dashboard, widget.source, `${path}.source`, source, errors);
    validateBinding(widget.title, `${path}.title`, errors);
    validateBinding(widget.status, `${path}.status`, errors);
    widget.actions?.forEach((action, index) => validateAction(action, `${path}.actions.${index}`, dashboard, source, errors));
    if (!Array.isArray(widget.main) || widget.main.length === 0) {
        errors.push(`${path}.main must contain at least one section`);
    }
    const fieldIds = new Set<string>();
    widget.main?.forEach((section, index) => validateSection(section, `${path}.main.${index}`, dashboard, source, fieldIds, errors));
    widget.aside?.forEach((section, index) => validateSection(section, `${path}.aside.${index}`, dashboard, source, fieldIds, errors));
}

function validateSectionWidget(
    widget: Extract<DashboardWidget, { widget: "w-section" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    if (!widget.title) errors.push(`${path}.title is required`);
    if (!Array.isArray(widget.children) || widget.children.length === 0) {
        errors.push(`${path}.children must contain at least one widget`);
        return;
    }
    widget.children.forEach((child, index) => validateWidget(child, `${path}.children.${index}`, dashboard, source, widgetIds, errors));
}

function validateTabsWidget(
    widget: Extract<DashboardWidget, { widget: "w-tabs" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    widgetIds: Set<string>,
    errors: string[],
): void {
    if (!Array.isArray(widget.tabs) || widget.tabs.length === 0) {
        errors.push(`${path}.tabs must contain at least one tab`);
        return;
    }
    const tabIds = new Set<string>();
    widget.tabs.forEach((tab, index) => {
        validateRequiredId(`${path}.tabs.${index}.id`, tab.id, errors);
        if (tab.id) {
            if (tabIds.has(tab.id)) errors.push(`duplicate tab id "${tab.id}" in ${path}`);
            tabIds.add(tab.id);
        }
        if (!tab.label) errors.push(`${path}.tabs.${index}.label is required`);
        if (!Array.isArray(tab.children) || tab.children.length === 0) {
            errors.push(`${path}.tabs.${index}.children must contain at least one widget`);
        }
        tab.children?.forEach((child, childIndex) =>
            validateWidget(child, `${path}.tabs.${index}.children.${childIndex}`, dashboard, source, widgetIds, errors));
    });
}

function validateColumn(column: DashboardColumn, path: string, errors: string[]): void {
    validateRequiredId(`${path}.id`, column.id, errors);
    if (!column.label) errors.push(`${path}.label is required`);
    validateRequiredPath("path", column.path, path, errors);
    if (column.format !== undefined && !["text", "badge", "date", "money"].includes(column.format)) {
        errors.push(`${path}.format is not supported`);
    }
}

function validateFilter(filter: DashboardFilter, path: string, errors: string[]): void {
    validateRequiredId(`${path}.id`, filter.id, errors);
    if (!filter.label) errors.push(`${path}.label is required`);
    validatePath("path", filter.path, path, errors);
    validateId(`${path}.param`, filter.param, errors);
    if (!filter.path && !filter.param) errors.push(`${path} must declare path or param`);
    if (filter.type !== undefined && filter.type !== "text" && filter.type !== "select") {
        errors.push(`${path}.type is not supported`);
    }
    if (filter.type === "select") validateOptions(filter.options, `${path}.options`, errors);
}

function validateSection(
    section: DashboardSection,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    fieldIds: Set<string>,
    errors: string[],
): void {
    validateRequiredId(`${path}.id`, section.id, errors);
    if (!section.title) errors.push(`${path}.title is required`);
    if (!Array.isArray(section.fields)) {
        errors.push(`${path}.fields must be an array`);
        return;
    }
    section.fields.forEach((field, index) => validateField(field, `${path}.fields.${index}`, dashboard, source, fieldIds, errors));
}

function validateField(
    field: DashboardField,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    fieldIds: Set<string>,
    errors: string[],
): void {
    validateRequiredId(`${path}.id`, field.id, errors);
    if (field.id) {
        if (fieldIds.has(field.id)) errors.push(`duplicate field id "${field.id}"`);
        fieldIds.add(field.id);
    }
    if (!field.label) errors.push(`${path}.label is required`);
    validateRequiredPath("path", field.path, path, errors);
    validateVisibility(field.visibleWhen, `${path}.visibleWhen`, errors);

    switch (field.type) {
        case "text":
        case "readonly":
            break;
        case "textarea":
            if (field.type === "textarea" && field.rows !== undefined && (!Number.isInteger(field.rows) || field.rows < 1)) {
                errors.push(`${path}.rows must be a positive integer`);
            }
            break;
        case "select":
            validateOptions(field.type === "select" ? field.options : undefined, `${path}.options`, errors);
            break;
        case "combobox":
        case "tokens":
            validateSelectableField(field, path, dashboard, source, errors);
            break;
        case "media":
            validateMediaField(field, path, dashboard, source, errors);
            break;
        default:
            errors.push(`${path}.type is not supported`);
    }
}

function validateSelectableField(
    field: Extract<DashboardField, { type: "combobox" | "tokens" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    const hasOptions = Array.isArray(field.options) && field.options.length > 0;
    const hasLookup = field.lookup !== undefined;
    if (!hasOptions && !hasLookup && field.allowCustom !== true) {
        errors.push(`${path} must declare options, lookup, or allowCustom`);
    }
    if (field.options !== undefined) validateOptions(field.options, `${path}.options`, errors);
    if (field.lookup) validateLookup(field.lookup, `${path}.lookup`, dashboard, source, errors);
}

function validateMediaField(
    field: Extract<DashboardField, { type: "media" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validatePath("item.idPath", field.item.idPath, path, errors);
    validateRequiredPath("item.urlPath", field.item.urlPath, path, errors);
    validatePath("item.altPath", field.item.altPath, path, errors);
    if (!field.actions) return;
    for (const [action, ref] of Object.entries(field.actions)) {
        if (ref) validateEndpointRef(dashboard, ref, `${path}.actions.${action}`, source, errors);
    }
}

function validateAction(
    action: DashboardAction,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validateRequiredId(`${path}.id`, action.id, errors);
    if (!action.label) errors.push(`${path}.label is required`);
    if (action.placement !== undefined && !["primary", "secondary", "more"].includes(action.placement)) {
        errors.push(`${path}.placement is not supported`);
    }
    if (action.tone !== undefined && !["primary", "secondary", "danger"].includes(action.tone)) {
        errors.push(`${path}.tone is not supported`);
    }
    if (action.section !== undefined && !action.section.trim()) errors.push(`${path}.section must be non-empty when provided`);
    validateEndpointRef(dashboard, action.endpoint, `${path}.endpoint`, source, errors);
}

function validateLookup(
    lookup: DashboardLookupRef,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validateDataRef(dashboard, lookup, path, source, errors);
    validateRequiredPath("valuePath", lookup.valuePath, path, errors);
    validateRequiredPath("labelPath", lookup.labelPath, path, errors);
    validatePath("subtitlePath", lookup.subtitlePath, path, errors);
    validatePath("mediaPath", lookup.mediaPath, path, errors);
    lookup.descriptionPaths?.forEach((entry, index) => validatePath(`${index}`, entry, `${path}.descriptionPaths`, errors));
    if (lookup.selected) validateDataRef(dashboard, lookup.selected, `${path}.selected`, source, errors);
    if (lookup.create) validateLookupCreate(lookup.create, `${path}.create`, dashboard, source, errors);
}

function validateLookupCreate(
    create: DashboardLookupCreate,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validateEndpointRef(dashboard, create, path, source, errors);
    validateRequiredPath("valuePath", create.valuePath, path, errors);
    validateRequiredPath("labelPath", create.labelPath, path, errors);
    if (create.mode === "inline") return;
    if (create.mode !== "modal") {
        errors.push(`${path}.mode is not supported`);
        return;
    }
    if (!Array.isArray(create.fields) || create.fields.length === 0) {
        errors.push(`${path}.fields must contain at least one field`);
        return;
    }
    const fieldIds = new Set<string>();
    create.fields.forEach((field, index) => validateField(field, `${path}.fields.${index}`, dashboard, source, fieldIds, errors));
}

function validateDataRef(
    dashboard: DashboardDto,
    ref: DashboardDataRef,
    path: string,
    source: Source | null,
    errors: string[],
): void {
    if (!isRecord(ref)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateEndpointRef(dashboard, ref, path, source, errors);
    validatePath("itemsPath", ref.itemsPath, path, errors);
    validatePath("itemPath", ref.itemPath, path, errors);
    validatePath("totalPath", ref.totalPath, path, errors);
}

function validateEndpointRef(
    dashboard: DashboardDto,
    ref: DashboardEndpointRef,
    path: string,
    source: Source | null,
    errors: string[],
): void {
    if (!isRecord(ref)) {
        errors.push(`${path} must be an object`);
        return;
    }
    validateRequiredId(`${path}.endpoint`, ref.endpoint, errors);
    const endpoint = source ? endpointFor(dashboard, ref.endpoint, source) : null;
    if (source && !endpoint) errors.push(`${path}.endpoint references unknown endpoint "${ref.endpoint}"`);
    validateExpressionMap(ref.params, `${path}.params`, errors);
    validateExpressionMap(ref.body, `${path}.body`, errors);
    if (endpoint && ref.params) validateEndpointParams(endpoint, ref.params, `${path}.params`, errors);
}

function validateEndpointParams(
    endpoint: SourceEndpoint,
    params: Record<string, string>,
    path: string,
    errors: string[],
): void {
    const declared = new Set((endpoint.input?.params ?? []).map(param => param.name));
    for (const key of Object.keys(params)) {
        if (!declared.has(key)) errors.push(`${path}.${key} is not declared by endpoint "${endpoint.urn}"`);
    }
}

function endpointFor(dashboard: DashboardDto, endpointId: string, source: Source): SourceEndpoint | null {
    const urn = makeEndpointUrn(dashboard.source, endpointId);
    return source.endpoints.find(endpoint => endpoint.urn === urn) ?? null;
}

function validateExpressionMap(map: Record<string, string> | undefined, path: string, errors: string[]): void {
    if (!map) return;
    for (const [key, value] of Object.entries(map)) {
        if (!key) errors.push(`${path} contains an empty key`);
        if (typeof value !== "string") {
            errors.push(`${path}.${key} must be a string expression`);
        } else {
            validateExpression(`${path}.${key}`, value, errors);
        }
    }
}

function validateExpression(path: string, value: string, errors: string[]): void {
    if (!value.startsWith("$")) return;
    if (!PARAM_EXPR.test(value)) errors.push(`${path} has an invalid binding expression`);
}

function validateBinding(binding: DashboardBinding | undefined, path: string, errors: string[]): void {
    if (!binding) return;
    validatePath("path", binding.path, path, errors);
}

function validateVisibility(rule: DashboardVisibilityRule | undefined, path: string, errors: string[]): void {
    if (!rule) return;
    validatePath("field", rule.field, path, errors);
    if (rule.equals === undefined && rule.notEquals === undefined) {
        errors.push(`${path} must declare equals or notEquals`);
    }
}

function validateOptions(options: DashboardOption[] | undefined, path: string, errors: string[]): void {
    if (!Array.isArray(options) || options.length === 0) {
        errors.push(`${path} must contain at least one option`);
        return;
    }
    options.forEach((option, index) => {
        if (!option.value) errors.push(`${path}.${index}.value is required`);
        if (!option.label) errors.push(`${path}.${index}.label is required`);
    });
}

function validateRequiredId(path: string, value: string | undefined, errors: string[]): void {
    if (value === undefined || value === "") {
        errors.push(`${path} is required`);
        return;
    }
    validateId(path, value, errors);
}

function validateId(path: string, value: string | undefined, errors: string[]): void {
    if (value === undefined) return;
    if (!SIMPLE_ID.test(value)) errors.push(`${path} must be a simple id`);
}

function validateRequiredPath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value === undefined || value === "") {
        errors.push(`${path}.${name} is required`);
        return;
    }
    validatePath(name, value, path, errors);
}

function validatePath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value === undefined) return;
    if (!SAFE_PATH.test(value)) errors.push(`${path}.${name} must be a dotted data path`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
