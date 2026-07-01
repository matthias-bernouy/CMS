import type {
    Collection,
    CollectionEndpointRef,
    ColumnFormat,
    ColumnSpec,
    DashboardDto,
    DashboardWidget,
    FieldInput,
    FieldSpec,
    FilterSpec,
    RowAction,
} from "@bernouy/cms-dashboards";
import type {
    ComputedParamRef,
    EndpointHeader,
    HeaderSource,
    SourceDto,
    SourceEndpointDto,
    SourceParamDto,
} from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import type { DeclarativeArtifactTemplate } from "../../interfaces/Integration";
import {
    isJsonValue,
    isRecord,
    text,
} from "./values";

export function parseArtifactTemplates(value: unknown): DeclarativeArtifactTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.artifacts", "must be an array");
    return value.map((entry, index) => parseArtifactTemplate(entry, `definition.artifacts.${index}`));
}

function parseArtifactTemplate(value: unknown, name: string): DeclarativeArtifactTemplate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const type = text(value.type);
    if (type === "source") {
        if (!isRecord(value.source)) throw new IntegrationInputError(`${name}.source`, "must be an object");
        return { type: "source", source: parseSourceTemplate(value.source, `${name}.source`) };
    }
    if (type === "dashboard") {
        if (!isRecord(value.dashboard)) throw new IntegrationInputError(`${name}.dashboard`, "must be an object");
        return { type: "dashboard", dashboard: parseDashboardTemplate(value.dashboard, `${name}.dashboard`) };
    }
    throw new IntegrationInputError(`${name}.type`, "must be source or dashboard");
}

function parseSourceTemplate(value: Record<string, unknown>, name: string): SourceDto {
    const id = text(value.id);
    if (!id) throw new MissingIntegrationParam(`${name}.id`);
    if (!isRecord(value.meta)) throw new IntegrationInputError(`${name}.meta`, "must be an object");
    const metaName = text(value.meta.name);
    if (!metaName) throw new MissingIntegrationParam(`${name}.meta.name`);
    if (!Array.isArray(value.endpoints)) throw new IntegrationInputError(`${name}.endpoints`, "must be an array");
    return {
        id,
        meta: {
            name: metaName,
            ...(text(value.meta.description) ? { description: text(value.meta.description)! } : {}),
            ...(text(value.meta.icon) ? { icon: text(value.meta.icon)! } : {}),
            ...(text(value.meta.svg) ? { svg: text(value.meta.svg)! } : {}),
        },
        endpoints: value.endpoints.map((endpoint, index) => parseEndpointTemplate(endpoint, `${name}.endpoints.${index}`)),
    };
}

function parseEndpointTemplate(value: unknown, name: string): SourceEndpointDto {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const endpointId = text(value.endpointId);
    if (!endpointId) throw new MissingIntegrationParam(`${name}.endpointId`);
    const method = text(value.method);
    if (!method) throw new MissingIntegrationParam(`${name}.method`);
    const targetUrl = text(value.targetUrl);
    if (!targetUrl) throw new MissingIntegrationParam(`${name}.targetUrl`);
    if (!Array.isArray(value.params)) throw new IntegrationInputError(`${name}.params`, "must be an array");
    return {
        endpointId,
        method: method as SourceEndpointDto["method"],
        targetUrl,
        params: value.params.map((param, index) => parseParamTemplate(param, `${name}.params.${index}`)),
        ...(isJsonValue(value.body) ? { body: value.body as SourceEndpointDto["body"] } : {}),
        ...(Array.isArray(value.output) ? { output: value.output as SourceEndpointDto["output"] } : {}),
        ...(isRecord(value.meta) ? { meta: value.meta as SourceEndpointDto["meta"] } : {}),
        ...(value.headers !== undefined ? { headers: parseHeaderTemplates(value.headers, `${name}.headers`) } : {}),
    };
}

function parseHeaderTemplates(value: unknown, name: string): EndpointHeader[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseHeaderTemplate(entry, `${name}.${index}`));
}

function parseHeaderTemplate(value: unknown, name: string): EndpointHeader {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const headerName = text(value.name);
    if (!headerName) throw new MissingIntegrationParam(`${name}.name`);
    if (!isRecord(value.source)) throw new IntegrationInputError(`${name}.source`, "must be an object");
    return { name: headerName, source: parseHeaderSource(value.source, `${name}.source`) };
}

function parseHeaderSource(value: Record<string, unknown>, name: string): HeaderSource {
    const from = text(value.from);
    if (from === "static") {
        if (typeof value.value !== "string") throw new MissingIntegrationParam(`${name}.value`);
        return { from, value: value.value };
    }
    if (from === "secret") {
        const ref = text(value.ref);
        if (!ref) throw new MissingIntegrationParam(`${name}.ref`);
        return { from, ref, ...(typeof value.prefix === "string" ? { prefix: value.prefix } : {}) };
    }
    if (from === "computed") {
        const ref = text(value.ref);
        if (!ref) throw new MissingIntegrationParam(`${name}.ref`);
        return { from, ref: ref as ComputedParamRef };
    }
    throw new IntegrationInputError(`${name}.from`, "must be static, secret, or computed");
}

function parseParamTemplate(value: unknown, name: string): SourceParamDto {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const paramName = text(value.name);
    if (!paramName) throw new MissingIntegrationParam(`${name}.name`);
    const location = text(value.in);
    if (!location) throw new MissingIntegrationParam(`${name}.in`);
    return {
        name: paramName,
        in: location as SourceParamDto["in"],
        ...(text(value.type) ? { type: text(value.type)! as SourceParamDto["type"] } : {}),
        ...(value.required === true ? { required: true } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(isRecord(value.source) ? { source: value.source as SourceParamDto["source"] } : {}),
    };
}

function parseDashboardTemplate(value: Record<string, unknown>, name: string): DashboardDto {
    const id = text(value.id);
    if (!id) throw new MissingIntegrationParam(`${name}.id`);
    const source = text(value.source);
    if (!source) throw new MissingIntegrationParam(`${name}.source`);
    if (!Array.isArray(value.collections)) throw new IntegrationInputError(`${name}.collections`, "must be an array");
    if (!Array.isArray(value.views)) throw new IntegrationInputError(`${name}.views`, "must be an array");
    return {
        id,
        ...(isRecord(value.meta) ? { meta: parseDashboardMeta(value.meta, `${name}.meta`) } : {}),
        source,
        collections: value.collections.map((collection, index) => parseCollection(collection, `${name}.collections.${index}`)),
        views: value.views.map((widget, index) => parseWidget(widget, `${name}.views.${index}`)),
        ...(text(value.requires) ? { requires: text(value.requires)! } : {}),
    };
}

function parseDashboardMeta(value: Record<string, unknown>, name: string): DashboardDto["meta"] {
    const metaName = text(value.name);
    if (!metaName) throw new MissingIntegrationParam(`${name}.name`);
    return {
        name: metaName,
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(text(value.svg) ? { svg: text(value.svg)! } : {}),
    };
}

function parseCollection(value: unknown, name: string): Collection {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const id = text(value.id);
    if (!id) throw new MissingIntegrationParam(`${name}.id`);
    if (!isRecord(value.list)) throw new IntegrationInputError(`${name}.list`, "must be an object");
    const item = isRecord(value.item) ? parseCollectionItem(value.item, `${name}.item`) : undefined;
    return {
        id,
        ...(text(value.rowKey) ? { rowKey: text(value.rowKey)! } : {}),
        list: parseListEndpointRef(value.list, `${name}.list`),
        ...(item ? { item } : {}),
    };
}

function parseCollectionItem(value: Record<string, unknown>, name: string): NonNullable<Collection["item"]> {
    const item: NonNullable<Collection["item"]> = {};
    for (const action of ["get", "create", "update", "patch", "delete"] as const) {
        if (value[action] !== undefined) {
            if (!isRecord(value[action])) throw new IntegrationInputError(`${name}.${action}`, "must be an object");
            item[action] = parseEndpointRef(value[action], `${name}.${action}`);
        }
    }
    return item;
}

function parseListEndpointRef(value: Record<string, unknown>, name: string): Collection["list"] {
    return {
        ...parseEndpointRef(value, name),
        ...(text(value.itemsPath) ? { itemsPath: text(value.itemsPath)! } : {}),
        ...(text(value.totalPath) ? { totalPath: text(value.totalPath)! } : {}),
    };
}

function parseEndpointRef(value: Record<string, unknown>, name: string): CollectionEndpointRef {
    const endpoint = text(value.endpoint);
    if (!endpoint) throw new MissingIntegrationParam(`${name}.endpoint`);
    return {
        endpoint,
        ...(value.params !== undefined ? { params: parseParamMap(value.params, `${name}.params`) } : {}),
    };
}

function parseParamMap(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== "string") throw new IntegrationInputError(`${name}.${key}`, "must be a string");
        out[key] = entry;
    }
    return out;
}

function parseWidget(value: unknown, name: string): DashboardWidget {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const widget = text(value.widget);
    switch (widget) {
        case "w-section":
            return {
                widget,
                ...(text(value.title) ? { title: text(value.title)! } : {}),
                children: parseWidgetArray(value.children, `${name}.children`),
            };
        case "w-tabs":
            if (!Array.isArray(value.tabs)) throw new IntegrationInputError(`${name}.tabs`, "must be an array");
            return {
                widget,
                tabs: value.tabs.map((tab, index) => parseTab(tab, `${name}.tabs.${index}`)),
            };
        case "w-table":
            return {
                widget,
                collection: requiredText(value.collection, `${name}.collection`),
                ...(value.columns !== undefined ? { columns: parseColumns(value.columns, `${name}.columns`) } : {}),
                ...(value.rowActions !== undefined ? { rowActions: parseRowActions(value.rowActions, `${name}.rowActions`) } : {}),
                ...(value.filters !== undefined ? { filters: parseFilters(value.filters, `${name}.filters`) } : {}),
                ...(typeof value.pageSize === "number" ? { pageSize: value.pageSize } : {}),
            };
        case "w-detail":
        case "w-detail-item-put":
        case "w-detail-patch":
        case "w-create":
            return {
                widget,
                collection: requiredText(value.collection, `${name}.collection`),
                ...(value.fields !== undefined ? { fields: parseFields(value.fields, `${name}.fields`) } : {}),
            };
        case "w-stat":
            return {
                widget,
                endpoint: requiredText(value.endpoint, `${name}.endpoint`),
                path: requiredText(value.path, `${name}.path`),
                ...(text(value.label) ? { label: text(value.label)! } : {}),
            };
        default:
            throw new IntegrationInputError(`${name}.widget`, "must be a supported dashboard widget");
    }
}

function parseWidgetArray(value: unknown, name: string): DashboardWidget[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseWidget(entry, `${name}.${index}`));
}

function parseTab(value: unknown, name: string): { label: string; children: DashboardWidget[] } {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        label: requiredText(value.label, `${name}.label`),
        children: parseWidgetArray(value.children, `${name}.children`),
    };
}

function parseColumns(value: unknown, name: string): ColumnSpec[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseColumn(entry, `${name}.${index}`));
}

function parseColumn(value: unknown, name: string): ColumnSpec {
    if (typeof value === "string") return value;
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be a string or object");
    return {
        field: requiredText(value.field, `${name}.field`),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(parseColumnFormat(value.format, `${name}.format`) ? { format: parseColumnFormat(value.format, `${name}.format`)! } : {}),
    };
}

function parseColumnFormat(value: unknown, name: string): ColumnFormat | undefined {
    if (value === undefined) return undefined;
    if (value === "date" || value === "money" || value === "badge" || value === "text") return value;
    throw new IntegrationInputError(name, "must be date, money, badge, or text");
}

function parseFields(value: unknown, name: string): FieldSpec[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseField(entry, `${name}.${index}`));
}

function parseField(value: unknown, name: string): FieldSpec {
    if (typeof value === "string") return value;
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be a string or object");
    return {
        field: requiredText(value.field, `${name}.field`),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(parseFieldInput(value.input, `${name}.input`) ? { input: parseFieldInput(value.input, `${name}.input`)! } : {}),
        ...(value.readonly === true ? { readonly: true } : {}),
        ...(value.required === true ? { required: true } : {}),
    };
}

function parseFieldInput(value: unknown, name: string): FieldInput | undefined {
    if (value === undefined) return undefined;
    if (value === "text" || value === "select" || value === "boolean" || value === "number") return value;
    throw new IntegrationInputError(name, "must be text, select, boolean, or number");
}

function parseFilters(value: unknown, name: string): FilterSpec[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseFilter(entry, `${name}.${index}`));
}

function parseFilter(value: unknown, name: string): FilterSpec {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const filter: FilterSpec = {
        field: requiredText(value.field, `${name}.field`),
        ...(text(value.param) ? { param: text(value.param)! } : {}),
        ...(value.input === "select" ? { input: "select" } : value.input === "text" ? { input: "text" } : {}),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(text(value.placeholder) ? { placeholder: text(value.placeholder)! } : {}),
    };
    if (value.input !== undefined && value.input !== "select" && value.input !== "text") {
        throw new IntegrationInputError(`${name}.input`, "must be text or select");
    }
    if (value.options !== undefined) {
        if (!Array.isArray(value.options)) throw new IntegrationInputError(`${name}.options`, "must be an array");
        filter.options = value.options.map((option, index) => requiredText(option, `${name}.options.${index}`));
    }
    return filter;
}

function parseRowActions(value: unknown, name: string): RowAction[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseRowAction(entry, `${name}.${index}`));
}

function parseRowAction(value: unknown, name: string): RowAction {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const action = text(value.action);
    if (action !== "get" && action !== "create" && action !== "update" && action !== "patch" && action !== "delete") {
        throw new IntegrationInputError(`${name}.action`, "must be get, create, update, patch, or delete");
    }
    if (value.body !== undefined && !isRecord(value.body)) {
        throw new IntegrationInputError(`${name}.body`, "must be an object");
    }
    return {
        widget: "w-table-row-action",
        label: requiredText(value.label, `${name}.label`),
        action,
        ...(isRecord(value.body) ? { body: value.body } : {}),
        ...(value.confirm === true ? { confirm: true } : {}),
        ...(text(value.requires) ? { requires: text(value.requires)! } : {}),
    };
}

function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) throw new MissingIntegrationParam(name);
    return result;
}
