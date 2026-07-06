import type { DashboardAction, DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../types";
import type { DetailSelection } from "../domain";
import type { WidgetMediaActionDetail } from "../widgets/shared";
import type { DashboardMediaItem } from "../widgets/w-media-field/types";
import { fetchSourceJson, itemFrom, sendSourceDownload, sendSourceForm, sendSourceJson } from "./source";
import { fieldValues } from "./mapping";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
type MediaField = DetailWidget["main"][number]["fields"][number] & { type: "media" };

export type DashboardActionResult =
    | ({ kind: "value"; value: unknown } & ActionResultMeta)
    | ({ kind: "download"; blob: Blob; filename: string } & ActionResultMeta);

type ActionResultMeta = {
    after?: DashboardAction["after"];
};

export async function executeDashboardAction(
    group: DashboardSourceGroup,
    dashboard: DashboardDto,
    detail: DetailSelection,
    actionId: string,
    draft: Record<string, unknown>,
    currentResource?: unknown,
): Promise<DashboardActionResult> {
    const widget = findDetailWidget(dashboard.views, detail.collection);
    if (!widget) throw new Error(`Dashboard action target "${detail.collection}" was not found`);
    const action = widget.actions?.find(item => item.id === actionId);
    if (!action) throw new Error(`Dashboard action "${actionId}" was not found`);
    if (!action.endpoint) throw new Error(`Dashboard action "${actionId}" does not declare an endpoint`);
    const resource = currentResource ?? await fetchActionResource(dashboard.source, widget, detail.row);
    const fields = { ...fieldValues(widget, resource), ...draft };
    return executeEndpointAction(group, action, {
        selection: { id: detail.row },
        resource,
        fields,
    });
}

export async function executeDashboardTableAction(
    group: DashboardSourceGroup,
    dashboard: DashboardDto,
    actionId: string,
    widgetId?: string,
): Promise<DashboardActionResult> {
    const action = findTableAction(dashboard.views, actionId, widgetId);
    if (!action) throw new Error(`Dashboard table action "${actionId}" was not found`);
    if (!action.endpoint) throw new Error(`Dashboard table action "${actionId}" does not declare an endpoint`);
    return executeEndpointAction(group, action, { filters: {} });
}

async function executeEndpointAction(
    group: DashboardSourceGroup,
    action: DashboardAction,
    vars: { selection?: Record<string, unknown>; resource?: unknown; fields?: Record<string, unknown>; filters?: Record<string, unknown> },
): Promise<DashboardActionResult> {
    if (!action.endpoint) throw new Error(`Dashboard action "${action.id}" does not declare an endpoint`);
    const method = endpointMethod(group, action.endpoint.endpoint);
    if (action.download) {
        const download = await sendSourceDownload(group.source.id, action.endpoint, method, vars);
        return {
            kind: "download",
            blob: download.blob,
            filename: action.download.filename ?? download.filename ?? `${action.id}.download`,
            ...actionMeta(action),
        };
    }
    return {
        kind: "value",
        value: await sendSourceJson(group.source.id, action.endpoint, method, vars),
        ...actionMeta(action),
    };
}

function actionMeta(action: DashboardAction): ActionResultMeta {
    return action.after ? { after: action.after } : {};
}

async function fetchActionResource(sourceId: string, widget: DetailWidget, row: string): Promise<unknown> {
    const data = await fetchSourceJson(sourceId, widget.source, { selection: { id: row } });
    return itemFrom(data, widget.source);
}

export async function executeDashboardMediaAction(
    group: DashboardSourceGroup,
    dashboard: DashboardDto,
    detail: DetailSelection,
    media: WidgetMediaActionDetail,
    draft: Record<string, unknown>,
): Promise<unknown[]> {
    const widget = findDetailWidget(dashboard.views, detail.collection);
    if (!widget) throw new Error(`Dashboard media target "${detail.collection}" was not found`);
    const field = findMediaField(widget, media.field);
    const ref = field?.actions?.[media.action];
    if (!field || !ref) return [];
    const data = await fetchSourceJson(dashboard.source, widget.source, { selection: { id: detail.row } });
    const resource = itemFrom(data, widget.source);
    const fields = { ...fieldValues(widget, resource), ...draft };
    const mediaVars = mediaActionVars(media);
    const files = media.files ?? (media.file ? [media.file] : []);
    if (!files.length) return [await sendSourceJson(group.source.id, ref, endpointMethod(group, ref.endpoint), { resource, fields, media: mediaVars })];
    return Promise.all(files.map(file => {
        const body = new FormData();
        body.set("file", file);
        return sendSourceForm(group.source.id, ref, endpointMethod(group, ref.endpoint), { resource, fields, media: mediaVars }, body);
    }));
}

function findDetailWidget(widgets: DashboardWidget[], id: string): DetailWidget | null {
    for (const widget of widgets) {
        if (widget.widget === "w-detail" && widget.id === id) return widget;
        if (widget.widget === "w-section") {
            const found = findDetailWidget(widget.children, id);
            if (found) return found;
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findDetailWidget(tab.children, id);
                if (found) return found;
            }
        }
    }
    return null;
}

function findTableAction(widgets: DashboardWidget[], actionId: string, widgetId: string | undefined): DashboardAction | null {
    for (const widget of widgets) {
        if (widget.widget === "w-table" && (!widgetId || widget.id === widgetId)) {
            const action = widget.actions?.find(item => item.id === actionId);
            if (action) return action;
        }
        if (widget.widget === "w-section") {
            const found = findTableAction(widget.children, actionId, widgetId);
            if (found) return found;
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findTableAction(tab.children, actionId, widgetId);
                if (found) return found;
            }
        }
    }
    return null;
}

function endpointMethod(group: DashboardSourceGroup, endpointId: string): string {
    return group.endpoints.find(endpoint => endpoint.endpointId === endpointId)?.method ?? "GET";
}

function findMediaField(widget: DetailWidget, fieldId: string): MediaField | null {
    const fields = [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields);
    return fields.find((field): field is MediaField => field.id === fieldId && field.type === "media") ?? null;
}

function mediaActionVars(media: WidgetMediaActionDetail): Record<string, unknown> {
    return {
        action: media.action,
        index: media.index,
        from: media.from,
        to: media.to,
        item: media.item,
        previousItem: media.previousItem,
        value: media.value,
        valueIds: media.value.map(mediaId).filter(Boolean),
    };
}

function mediaId(item: DashboardMediaItem): string {
    return item.id;
}
