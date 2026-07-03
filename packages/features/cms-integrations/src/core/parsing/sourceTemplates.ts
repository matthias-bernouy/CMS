import type {
    DashboardAction,
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
    DashboardWidget,
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
    if (!Array.isArray(value.views)) throw new IntegrationInputError(`${name}.views`, "must be an array");
    return {
        id,
        ...(isRecord(value.meta) ? { meta: parseDashboardMeta(value.meta, `${name}.meta`) } : {}),
        source,
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

function parseWidget(value: unknown, name: string): DashboardWidget {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const widget = text(value.widget);
    switch (widget) {
        case "w-section":
            return {
                widget,
                id: requiredText(value.id, `${name}.id`),
                title: requiredText(value.title, `${name}.title`),
                ...(text(value.description) ? { description: text(value.description)! } : {}),
                children: parseWidgetArray(value.children, `${name}.children`),
            };
        case "w-tabs":
            if (!Array.isArray(value.tabs)) throw new IntegrationInputError(`${name}.tabs`, "must be an array");
            return {
                widget,
                id: requiredText(value.id, `${name}.id`),
                tabs: value.tabs.map((tab, index) => parseTab(tab, `${name}.tabs.${index}`)),
            };
        case "w-table":
            if (!isRecord(value.source)) throw new IntegrationInputError(`${name}.source`, "must be an object");
            return {
                widget,
                id: requiredText(value.id, `${name}.id`),
                ...(text(value.title) ? { title: text(value.title)! } : {}),
                source: parseDataRef(value.source, `${name}.source`),
                rowKey: requiredText(value.rowKey, `${name}.rowKey`),
                columns: parseColumns(value.columns, `${name}.columns`),
                ...(value.filters !== undefined ? { filters: parseFilters(value.filters, `${name}.filters`) } : {}),
                ...(typeof value.pageSize === "number" ? { pageSize: value.pageSize } : {}),
                ...(isRecord(value.selection) ? { selection: parseSelection(value.selection, `${name}.selection`) } : {}),
            };
        case "w-detail":
            if (!isRecord(value.source)) throw new IntegrationInputError(`${name}.source`, "must be an object");
            return {
                widget,
                id: requiredText(value.id, `${name}.id`),
                source: parseDataRef(value.source, `${name}.source`),
                ...(isRecord(value.title) ? { title: parseBinding(value.title, `${name}.title`) } : {}),
                ...(isRecord(value.status) ? { status: parseBinding(value.status, `${name}.status`) } : {}),
                ...(value.actions !== undefined ? { actions: parseActions(value.actions, `${name}.actions`) } : {}),
                main: parseSections(value.main, `${name}.main`),
                ...(value.aside !== undefined ? { aside: parseSections(value.aside, `${name}.aside`) } : {}),
            };
        default:
            throw new IntegrationInputError(`${name}.widget`, "must be a supported dashboard widget");
    }
}

function parseWidgetArray(value: unknown, name: string): DashboardWidget[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseWidget(entry, `${name}.${index}`));
}

function parseTab(value: unknown, name: string): { id: string; label: string; children: DashboardWidget[] } {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        children: parseWidgetArray(value.children, `${name}.children`),
    };
}

function parseSelection(value: Record<string, unknown>, name: string): { opens?: string } {
    return {
        ...(text(value.opens) ? { opens: text(value.opens)! } : {}),
    };
}

function parseDataRef(value: Record<string, unknown>, name: string): DashboardDataRef {
    return {
        ...parseEndpointRef(value, name),
        ...(text(value.itemsPath) ? { itemsPath: text(value.itemsPath)! } : {}),
        ...(text(value.itemPath) ? { itemPath: text(value.itemPath)! } : {}),
        ...(text(value.totalPath) ? { totalPath: text(value.totalPath)! } : {}),
    };
}

function parseEndpointRef(value: Record<string, unknown>, name: string): DashboardEndpointRef {
    const endpoint = text(value.endpoint);
    if (!endpoint) throw new MissingIntegrationParam(`${name}.endpoint`);
    return {
        endpoint,
        ...(value.params !== undefined ? { params: parseStringMap(value.params, `${name}.params`) } : {}),
        ...(value.body !== undefined ? { body: parseStringMap(value.body, `${name}.body`) } : {}),
    };
}

function parseColumns(value: unknown, name: string): DashboardColumn[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseColumn(entry, `${name}.${index}`));
}

function parseColumn(value: unknown, name: string): DashboardColumn {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        path: requiredText(value.path, `${name}.path`),
        ...(value.primary === true ? { primary: true } : {}),
        ...(text(value.width) ? { width: text(value.width)! } : {}),
        ...(parseColumnFormat(value.format, `${name}.format`) ? { format: parseColumnFormat(value.format, `${name}.format`)! } : {}),
    };
}

function parseColumnFormat(value: unknown, name: string): DashboardColumn["format"] | undefined {
    if (value === undefined) return undefined;
    if (value === "date" || value === "money" || value === "badge" || value === "text") return value;
    throw new IntegrationInputError(name, "must be date, money, badge, or text");
}

function parseFilters(value: unknown, name: string): DashboardFilter[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseFilter(entry, `${name}.${index}`));
}

function parseFilter(value: unknown, name: string): DashboardFilter {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.path) ? { path: text(value.path)! } : {}),
        ...(text(value.param) ? { param: text(value.param)! } : {}),
        ...(value.type === "select" ? { type: "select" } : value.type === "text" ? { type: "text" } : {}),
        ...(text(value.placeholder) ? { placeholder: text(value.placeholder)! } : {}),
        ...(value.options !== undefined ? { options: parseOptions(value.options, `${name}.options`) } : {}),
    };
}

function parseSections(value: unknown, name: string): DashboardSection[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseSection(entry, `${name}.${index}`));
}

function parseSection(value: unknown, name: string): DashboardSection {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        title: requiredText(value.title, `${name}.title`),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        fields: parseFields(value.fields, `${name}.fields`),
    };
}

function parseFields(value: unknown, name: string): DashboardField[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseField(entry, `${name}.${index}`));
}

function parseField(value: unknown, name: string): DashboardField {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const base = {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        path: requiredText(value.path, `${name}.path`),
        ...(value.visibleWhen !== undefined ? { visibleWhen: parseFieldVisibility(value.visibleWhen, `${name}.visibleWhen`) } : {}),
        ...(value.required === true ? { required: true } : {}),
    };
    const type = requiredText(value.type, `${name}.type`);
    switch (type) {
        case "text":
            return { ...base, type, ...(text(value.placeholder) ? { placeholder: text(value.placeholder)! } : {}) };
        case "textarea":
            return { ...base, type, ...(typeof value.rows === "number" ? { rows: value.rows } : {}) };
        case "select":
            return { ...base, type, options: parseOptions(value.options, `${name}.options`) };
        case "combobox":
        case "tokens":
            return {
                ...base,
                type,
                ...(value.options !== undefined ? { options: parseOptions(value.options, `${name}.options`) } : {}),
                ...(value.lookup !== undefined ? { lookup: parseLookup(value.lookup, `${name}.lookup`) } : {}),
                ...(value.allowCustom === true ? { allowCustom: true } : {}),
            };
        case "media":
            return {
                ...base,
                type,
                ...(value.multiple === true ? { multiple: true } : {}),
                item: parseMediaItem(value.item, `${name}.item`),
                ...(value.actions !== undefined ? { actions: parseMediaActions(value.actions, `${name}.actions`) } : {}),
            };
        case "readonly":
            return {
                ...base,
                type,
                ...(parseReadonlyFormat(value.format, `${name}.format`) ? { format: parseReadonlyFormat(value.format, `${name}.format`)! } : {}),
            };
        default:
            throw new IntegrationInputError(`${name}.type`, "must be text, textarea, select, combobox, tokens, media, or readonly");
    }
}

function parseFieldVisibility(value: unknown, name: string): NonNullable<DashboardField["visibleWhen"]> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const rule: NonNullable<DashboardField["visibleWhen"]> = {
        field: requiredText(value.field, `${name}.field`),
    };
    if (value.equals !== undefined) rule.equals = parseVisibilityValue(value.equals, `${name}.equals`);
    if (value.notEquals !== undefined) rule.notEquals = parseVisibilityValue(value.notEquals, `${name}.notEquals`);
    if (rule.equals === undefined && rule.notEquals === undefined) {
        throw new IntegrationInputError(name, "must declare equals or notEquals");
    }
    return rule;
}

function parseVisibilityValue(value: unknown, name: string): string | number | boolean | null {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    throw new IntegrationInputError(name, "must be a string, number, boolean, or null");
}

function parseLookup(value: unknown, name: string): DashboardLookupRef {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...parseDataRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
        ...(text(value.subtitlePath) ? { subtitlePath: text(value.subtitlePath)! } : {}),
        ...(text(value.mediaPath) ? { mediaPath: text(value.mediaPath)! } : {}),
        ...(value.descriptionPaths !== undefined ? { descriptionPaths: parseStringList(value.descriptionPaths, `${name}.descriptionPaths`) } : {}),
        ...(value.selected !== undefined ? { selected: parseLookupSelected(value.selected, `${name}.selected`) } : {}),
        ...(value.create !== undefined ? { create: parseLookupCreate(value.create, `${name}.create`) } : {}),
    };
}

function parseLookupSelected(value: unknown, name: string): DashboardDataRef {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return parseDataRef(value, name);
}

function parseLookupCreate(value: unknown, name: string): DashboardLookupCreate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const mode = requiredText(value.mode, `${name}.mode`);
    const base = {
        ...parseEndpointRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
    };
    if (mode === "inline") return { ...base, mode };
    if (mode === "modal") {
        return {
            ...base,
            mode,
            ...(text(value.title) ? { title: text(value.title)! } : {}),
            fields: parseFields(value.fields, `${name}.fields`),
        };
    }
    throw new IntegrationInputError(`${name}.mode`, "must be inline or modal");
}

function parseMediaItem(value: unknown, name: string): Extract<DashboardField, { type: "media" }>["item"] {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...(text(value.idPath) ? { idPath: text(value.idPath)! } : {}),
        urlPath: requiredText(value.urlPath, `${name}.urlPath`),
        ...(text(value.altPath) ? { altPath: text(value.altPath)! } : {}),
    };
}

function parseMediaActions(value: unknown, name: string): Extract<DashboardField, { type: "media" }>["actions"] {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const actions: Extract<DashboardField, { type: "media" }>["actions"] = {};
    for (const action of ["upload", "replace", "remove", "reorder"] as const) {
        if (value[action] !== undefined) {
            if (!isRecord(value[action])) throw new IntegrationInputError(`${name}.${action}`, "must be an object");
            actions[action] = parseEndpointRef(value[action], `${name}.${action}`);
        }
    }
    return actions;
}

function parseReadonlyFormat(value: unknown, name: string): Extract<DashboardField, { type: "readonly" }>["format"] | undefined {
    if (value === undefined) return undefined;
    if (value === "date" || value === "money" || value === "badge" || value === "text" || value === "image" || value === "url") {
        return value;
    }
    throw new IntegrationInputError(name, "must be date, money, badge, text, image, or url");
}

function parseActions(value: unknown, name: string): DashboardAction[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseAction(entry, `${name}.${index}`));
}

function parseAction(value: unknown, name: string): DashboardAction {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    if (!isRecord(value.endpoint)) throw new IntegrationInputError(`${name}.endpoint`, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(parseActionTone(value.tone, `${name}.tone`) ? { tone: parseActionTone(value.tone, `${name}.tone`)! } : {}),
        ...(parseActionPlacement(value.placement, `${name}.placement`) ? { placement: parseActionPlacement(value.placement, `${name}.placement`)! } : {}),
        ...(text(value.section) ? { section: text(value.section)! } : {}),
        endpoint: parseEndpointRef(value.endpoint, `${name}.endpoint`),
        ...(text(value.confirm) ? { confirm: text(value.confirm)! } : {}),
    };
}

function parseActionTone(value: unknown, name: string): DashboardAction["tone"] | undefined {
    if (value === undefined) return undefined;
    if (value === "primary" || value === "secondary" || value === "danger") return value;
    throw new IntegrationInputError(name, "must be primary, secondary, or danger");
}

function parseActionPlacement(value: unknown, name: string): DashboardAction["placement"] | undefined {
    if (value === undefined) return undefined;
    if (value === "primary" || value === "secondary" || value === "more") return value;
    throw new IntegrationInputError(name, "must be primary, secondary, or more");
}

function parseBinding(value: Record<string, unknown>, name: string) {
    return {
        path: requiredText(value.path, `${name}.path`),
        ...(text(value.fallback) ? { fallback: text(value.fallback)! } : {}),
    };
}

function parseOptions(value: unknown, name: string): DashboardOption[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseOption(entry, `${name}.${index}`));
}

function parseOption(value: unknown, name: string): DashboardOption {
    if (typeof value === "string") return { value, label: value };
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be a string or object");
    return {
        value: requiredText(value.value, `${name}.value`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.subtitle) ? { subtitle: text(value.subtitle)! } : {}),
        ...(text(value.media) ? { media: text(value.media)! } : {}),
    };
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

function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) throw new MissingIntegrationParam(name);
    return result;
}
