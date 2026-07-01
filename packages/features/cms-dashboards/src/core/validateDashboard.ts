import { makeEndpointUrn, makeSourceUrn, type Source, type SourceEndpoint } from "@bernouy/cms-sources";
import type {
    Collection,
    CollectionEndpointRef,
    DashboardDto,
    DashboardWidget,
    FieldSpec,
    FilterSpec,
    RowAction,
} from "../interfaces/Dashboard";

const SIMPLE_ID = /^[^\s/]+$/;
const PARAM_EXPR = /^(\$row|\$param|\$user)\.[A-Za-z0-9_.-]+$/;

export type ValidateDashboardOptions = {
    source?: Source | null;
};

export function validateDashboard(dashboard: DashboardDto, options: ValidateDashboardOptions = {}): string[] {
    const errors: string[] = [];

    validateId("dashboard.id", dashboard.id, errors);
    validateId("dashboard.source", dashboard.source, errors);
    if (options.source && options.source.urn !== makeSourceUrn(dashboard.source)) {
        errors.push(`dashboard source "${dashboard.source}" does not match source "${options.source.urn}"`);
    }

    const collections = new Map<string, Collection>();
    for (const collection of dashboard.collections) {
        validateId(`collections.${collection.id || "<empty>"}.id`, collection.id, errors);
        if (collections.has(collection.id)) {
            errors.push(`duplicate collection id "${collection.id}"`);
        }
        collections.set(collection.id, collection);
        validateCollection(dashboard, collection, options.source ?? null, errors);
    }

    if (!dashboard.views.length) {
        errors.push("views must contain at least one widget");
    }
    dashboard.views.forEach((widget, index) => validateWidget(widget, `views.${index}`, collections, dashboard, options.source ?? null, errors));

    return errors;
}

function validateCollection(
    dashboard: DashboardDto,
    collection: Collection,
    source: Source | null,
    errors: string[],
): void {
    validateEndpointRef(dashboard, collection.list, `collections.${collection.id}.list`, source, errors);
    validatePath("itemsPath", collection.list.itemsPath, `collections.${collection.id}.list`, errors);
    validatePath("totalPath", collection.list.totalPath, `collections.${collection.id}.list`, errors);
    validatePath("rowKey", collection.rowKey, `collections.${collection.id}`, errors);

    if (!collection.item) return;
    for (const [action, ref] of Object.entries(collection.item) as Array<[keyof NonNullable<Collection["item"]>, CollectionEndpointRef | undefined]>) {
        if (ref) validateEndpointRef(dashboard, ref, `collections.${collection.id}.item.${action}`, source, errors);
    }
}

function validateWidget(
    widget: DashboardWidget,
    path: string,
    collections: Map<string, Collection>,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    switch (widget.widget) {
        case "w-section":
            widget.children.forEach((child, index) => validateWidget(child, `${path}.children.${index}`, collections, dashboard, source, errors));
            break;
        case "w-tabs":
            widget.tabs.forEach((tab, tabIndex) => {
                if (!tab.label) errors.push(`${path}.tabs.${tabIndex}.label is required`);
                tab.children.forEach((child, childIndex) =>
                    validateWidget(child, `${path}.tabs.${tabIndex}.children.${childIndex}`, collections, dashboard, source, errors));
            });
            break;
        case "w-table":
            validateCollectionRef(widget.collection, `${path}.collection`, collections, errors);
            widget.columns?.forEach((column, index) => validateSpecPath(column, `${path}.columns.${index}`, errors));
            widget.filters?.forEach((filter, index) => validateFilter(filter, `${path}.filters.${index}`, errors));
            widget.rowActions?.forEach((action, index) => validateRowAction(action, `${path}.rowActions.${index}`, collections.get(widget.collection), errors));
            if (widget.pageSize !== undefined && (!Number.isInteger(widget.pageSize) || widget.pageSize < 1)) {
                errors.push(`${path}.pageSize must be a positive integer`);
            }
            break;
        case "w-detail":
        case "w-detail-item-put":
        case "w-detail-patch":
        case "w-create":
            validateCollectionRef(widget.collection, `${path}.collection`, collections, errors);
            widget.fields?.forEach((field, index) => validateSpecPath(field, `${path}.fields.${index}`, errors));
            break;
        case "w-stat":
            validateEndpointRef(dashboard, { endpoint: widget.endpoint }, `${path}.endpoint`, source, errors);
            validatePath("path", widget.path, path, errors);
            break;
        default:
            errors.push(`${path}.widget is not supported`);
    }
}

function validateCollectionRef(
    collectionId: string,
    path: string,
    collections: Map<string, Collection>,
    errors: string[],
): void {
    if (!collections.has(collectionId)) {
        errors.push(`${path} references unknown collection "${collectionId}"`);
    }
}

function validateRowAction(
    action: RowAction,
    path: string,
    collection: Collection | undefined,
    errors: string[],
): void {
    if (!action.label) errors.push(`${path}.label is required`);
    if (!collection) return;
    if (!collection.item?.[action.action]) {
        errors.push(`${path}.action "${action.action}" has no matching collection item endpoint`);
    }
}

function validateFilter(filter: FilterSpec, path: string, errors: string[]): void {
    validatePath("field", filter.field, path, errors);
    validatePath("param", filter.param, path, errors);
}

function validateSpecPath(spec: FieldSpec | string, path: string, errors: string[]): void {
    const field = typeof spec === "string" ? spec : spec.field;
    validatePath("field", field, path, errors);
}

function validateEndpointRef(
    dashboard: DashboardDto,
    ref: CollectionEndpointRef,
    path: string,
    source: Source | null,
    errors: string[],
): void {
    validateId(`${path}.endpoint`, ref.endpoint, errors);
    const endpoint = source?.endpoints.find(candidate => candidate.urn === makeEndpointUrn(dashboard.source, ref.endpoint));
    if (source && !endpoint) {
        errors.push(`${path}.endpoint references unknown endpoint "${ref.endpoint}"`);
    }
    validateParamBindings(ref, endpoint ?? null, path, errors);
}

function validateParamBindings(
    ref: CollectionEndpointRef,
    endpoint: SourceEndpoint | null,
    path: string,
    errors: string[],
): void {
    const bindings = ref.params ?? {};
    const declaredParams = new Set((endpoint?.input?.params ?? []).map(param => param.name));

    for (const [name, expr] of Object.entries(bindings)) {
        validateId(`${path}.params.${name}`, name, errors);
        if (endpoint && !declaredParams.has(name)) {
            errors.push(`${path}.params.${name} does not match a declared endpoint param`);
        }
        if (typeof expr !== "string" || !expr) {
            errors.push(`${path}.params.${name} must be a non-empty string`);
        } else if (expr.startsWith("$") && !PARAM_EXPR.test(expr)) {
            errors.push(`${path}.params.${name} has invalid binding expression "${expr}"`);
        }
    }

    if (!endpoint) return;
    for (const param of endpoint.input?.params ?? []) {
        if (param.required && param.source?.from !== "computed" && !Object.hasOwn(bindings, param.name)) {
            errors.push(`${path}.params.${param.name} is required by endpoint "${endpoint.urn}"`);
        }
    }
}

function validateId(path: string, value: string, errors: string[]): void {
    if (typeof value !== "string" || !value) {
        errors.push(`${path} is required`);
        return;
    }
    if (!SIMPLE_ID.test(value)) {
        errors.push(`${path} must not contain whitespace or "/"`);
    }
}

function validatePath(name: string, value: string | undefined, path: string, errors: string[]): void {
    if (value === undefined) return;
    if (!value) errors.push(`${path}.${name} must be non-empty when provided`);
}
