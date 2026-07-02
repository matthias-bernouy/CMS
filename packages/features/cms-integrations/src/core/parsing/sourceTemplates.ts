import type {
    Collection,
    CollectionEndpointRef,
    ColumnFormat,
    ColumnSpec,
    DashboardDto,
    DashboardWidget,
    FieldFormat,
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
    if (type === "bloc") {
        if (!isRecord(value.bloc)) throw new IntegrationInputError(`${name}.bloc`, "must be an object");
        return { type: "bloc", bloc: parseBlocTemplate(value.bloc, `${name}.bloc`) };
    }
    throw new IntegrationInputError(`${name}.type`, "must be source, dashboard, or bloc");
}

function parseBlocTemplate(value: Record<string, unknown>, name: string): Extract<DeclarativeArtifactTemplate, { type: "bloc" }>["bloc"] {
    const tag = text(value.tag);
    const blocName = text(value.name);
    if (!tag) throw new MissingIntegrationParam(`${name}.tag`);
    if (!blocName) throw new MissingIntegrationParam(`${name}.name`);
    return {
        tag,
        name: blocName,
        ...(text(value.group) ? { group: text(value.group)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(text(value.path) ? { path: text(value.path)! } : {}),
        ...(text(value.view) ? { view: text(value.view)! } : {}),
        ...(value.editor === null ? { editor: null } : text(value.editor) ? { editor: text(value.editor)! } : {}),
        ...(text(value.viewJS) ? { viewJS: text(value.viewJS)! } : {}),
        ...(value.editorJS === null ? { editorJS: null } : text(value.editorJS) ? { editorJS: text(value.editorJS)! } : {}),
        ...(value.source !== undefined ? { source: parseSourceBundle(value.source, `${name}.source`) } : {}),
    };
}

function parseSourceBundle(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const out: Record<string, string> = {};
    for (const [path, content] of Object.entries(value)) {
        if (typeof content !== "string") throw new IntegrationInputError(`${name}.${path}`, "must be a string");
        out[path] = content;
    }
    return out;
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
    const responseKind = parseResponseKind(value.responseKind, `${name}.responseKind`);
    return {
        endpointId,
        method: method as SourceEndpointDto["method"],
        targetUrl,
        ...(responseKind ? { responseKind } : {}),
        ...(text(value.mediaType) ? { mediaType: text(value.mediaType)! } : {}),
        params: value.params.map((param, index) => parseParamTemplate(param, `${name}.params.${index}`)),
        ...(isJsonValue(value.body) ? { body: value.body as SourceEndpointDto["body"] } : {}),
        ...(Array.isArray(value.output) ? { output: value.output as SourceEndpointDto["output"] } : {}),
        ...(isRecord(value.meta) ? { meta: value.meta as SourceEndpointDto["meta"] } : {}),
        ...(value.headers !== undefined ? { headers: parseHeaderTemplates(value.headers, `${name}.headers`) } : {}),
    };
}

function parseResponseKind(value: unknown, name: string): SourceEndpointDto["responseKind"] | undefined {
    if (value === undefined) return undefined;
    if (value === "json" || value === "file") return value;
    throw new IntegrationInputError(name, "must be json or file");
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
            return {
                widget,
                collection: requiredText(value.collection, `${name}.collection`),
                ...(value.fields !== undefined ? { fields: parseFields(value.fields, `${name}.fields`) } : {}),
            };
        case "w-create":
            return {
                widget,
                collection: requiredText(value.collection, `${name}.collection`),
                ...(text(value.label) ? { label: text(value.label)! } : {}),
                ...(text(value.submitLabel) ? { submitLabel: text(value.submitLabel)! } : {}),
                ...(text(value.successMessage) ? { successMessage: text(value.successMessage)! } : {}),
                ...(value.fields !== undefined ? { fields: parseFields(value.fields, `${name}.fields`) } : {}),
                ...(value.resultFields !== undefined ? { resultFields: parseFields(value.resultFields, `${name}.resultFields`) } : {}),
            };
        case "w-update": {
            const action = parseUpdateAction(value.action, `${name}.action`);
            return {
                widget,
                collection: requiredText(value.collection, `${name}.collection`),
                ...(action ? { action } : {}),
                ...(text(value.label) ? { label: text(value.label)! } : {}),
                ...(text(value.submitLabel) ? { submitLabel: text(value.submitLabel)! } : {}),
                ...(text(value.successMessage) ? { successMessage: text(value.successMessage)! } : {}),
                ...(value.fields !== undefined ? { fields: parseFields(value.fields, `${name}.fields`) } : {}),
                ...(value.resultFields !== undefined ? { resultFields: parseFields(value.resultFields, `${name}.resultFields`) } : {}),
            };
        }
        case "w-delete":
            if (value.body !== undefined && !isRecord(value.body)) {
                throw new IntegrationInputError(`${name}.body`, "must be an object");
            }
            return {
                widget,
                collection: requiredText(value.collection, `${name}.collection`),
                ...(text(value.label) ? { label: text(value.label)! } : {}),
                ...(text(value.confirmLabel) ? { confirmLabel: text(value.confirmLabel)! } : {}),
                ...(text(value.successMessage) ? { successMessage: text(value.successMessage)! } : {}),
                ...(isRecord(value.body) ? { body: value.body } : {}),
            };
        case "w-action":
            return {
                widget,
                ...parseEndpointRef(value, name),
                label: requiredText(value.label, `${name}.label`),
                ...(text(value.successMessage) ? { successMessage: text(value.successMessage)! } : {}),
                ...(text(value.downloadName) ? { downloadName: text(value.downloadName)! } : {}),
                ...(typeof value.refresh === "boolean" ? { refresh: value.refresh } : {}),
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

function parseUpdateAction(value: unknown, name: string): "update" | "patch" | undefined {
    if (value === undefined) return undefined;
    if (value === "update" || value === "patch") return value;
    throw new IntegrationInputError(name, "must be update or patch");
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
        ...(parseFieldFormat(value.format, `${name}.format`) ? { format: parseFieldFormat(value.format, `${name}.format`)! } : {}),
        ...(parseFieldInput(value.input, `${name}.input`) ? { input: parseFieldInput(value.input, `${name}.input`)! } : {}),
        ...(value.options !== undefined ? { options: parseStringList(value.options, `${name}.options`) } : {}),
        ...(text(value.accept) ? { accept: text(value.accept)! } : {}),
        ...(value.media !== undefined ? { media: parseFieldMedia(value.media, `${name}.media`) } : {}),
        ...(value.upload !== undefined ? { upload: parseFieldUpload(value.upload, `${name}.upload`) } : {}),
        ...(value.lookup !== undefined ? { lookup: parseFieldLookup(value.lookup, `${name}.lookup`) } : {}),
        ...(value.readonly === true ? { readonly: true } : {}),
        ...(value.required === true ? { required: true } : {}),
    };
}

function parseFieldMedia(value: unknown, name: string): NonNullable<Extract<FieldSpec, { field: string }>["media"]> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return parseEndpointRef(value, name);
}

function parseFieldUpload(value: unknown, name: string): NonNullable<Extract<FieldSpec, { field: string }>["upload"]> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...parseEndpointRef(value, name),
        resultPath: requiredText(value.resultPath, `${name}.resultPath`),
    };
}

function parseFieldLookup(value: unknown, name: string): NonNullable<Extract<FieldSpec, { field: string }>["lookup"]> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...parseListEndpointRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
        ...(value.descriptionPaths !== undefined ? { descriptionPaths: parseStringList(value.descriptionPaths, `${name}.descriptionPaths`) } : {}),
        ...(value.map !== undefined ? { map: parseStringMap(value.map, `${name}.map`) } : {}),
    };
}

function parseFieldFormat(value: unknown, name: string): FieldFormat | undefined {
    if (value === undefined) return undefined;
    if (value === "date" || value === "money" || value === "badge" || value === "text" || value === "image" || value === "url") {
        return value;
    }
    throw new IntegrationInputError(name, "must be date, money, badge, text, image, or url");
}

function parseFieldInput(value: unknown, name: string): FieldInput | undefined {
    if (value === undefined) return undefined;
    if (value === "text" || value === "select" || value === "boolean" || value === "number" || value === "cms-user" || value === "file" || value === "lookup") return value;
    throw new IntegrationInputError(name, "must be text, select, boolean, number, cms-user, file, or lookup");
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

function parseStringList(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => requiredText(entry, `${name}.${index}`));
}

function parseStringMap(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        out[key] = requiredText(entry, `${name}.${key}`);
    }
    return out;
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
