import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DetailSelection } from "../../domain";
import type { DashboardSourceGroup } from "../../types";
import type { WidgetMediaActionDetail } from "../../widgets/shared";
import type { DashboardMediaItem } from "../../widgets/w-media-field/types";
import { matchesDashboardVisibility } from "../expressions";
import { fieldValues } from "../mapping";
import { fetchSourceJson, itemFrom, sendSourceForm, sendSourceJson } from "../source";
import { endpointMethod, executeEndpointAction, type DashboardActionResult } from "./endpoint";
import { findCollectionAction, findDetailWidget, findMediaField, type DetailWidget } from "./widgets";

export type { DashboardActionResult } from "./endpoint";

export async function executeDashboardAction(
    group: DashboardSourceGroup,
    dashboard: DashboardDto,
    detail: DetailSelection,
    actionId: string,
    draft: Record<string, unknown>,
    currentResource?: unknown,
    groups: DashboardSourceGroup[] = [group],
): Promise<DashboardActionResult> {
    const widget = findDetailWidget(dashboard.views, detail.collection);
    if (!widget) {
        throw new Error(`Dashboard action target "${detail.collection}" was not found`);
    }
    const action = widget.actions?.find((item) => item.id === actionId);
    if (!action) {
        throw new Error(`Dashboard action "${actionId}" was not found`);
    }
    if (!action.endpoint) {
        throw new Error(`Dashboard action "${actionId}" does not declare an endpoint`);
    }
    const resource = currentResource ?? (await fetchActionResource(dashboard.source, widget, detail.row));
    const fields = { ...fieldValues(widget, resource), ...draft };
    if (!matchesDashboardVisibility(action.visibleWhen, { resource, fields })) {
        throw new Error(`Dashboard action "${actionId}" is not available in the current state`);
    }
    return executeEndpointAction(group, groups, action, {
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
    value?: unknown,
    groups: DashboardSourceGroup[] = [group],
    filters: Readonly<Record<string, string>> = {},
): Promise<DashboardActionResult> {
    const action = findCollectionAction(dashboard.views, actionId, widgetId);
    if (!action) {
        throw new Error(`Dashboard table action "${actionId}" was not found`);
    }
    if (!action.endpoint) {
        throw new Error(`Dashboard table action "${actionId}" does not declare an endpoint`);
    }
    return executeEndpointAction(group, groups, action, { filters: { ...filters }, value });
}

export async function executeDashboardMediaAction(
    group: DashboardSourceGroup,
    dashboard: DashboardDto,
    detail: DetailSelection,
    media: WidgetMediaActionDetail,
    draft: Record<string, unknown>,
    groups: DashboardSourceGroup[] = [group],
): Promise<unknown[]> {
    const widget = findDetailWidget(dashboard.views, detail.collection);
    if (!widget) {
        throw new Error(`Dashboard media target "${detail.collection}" was not found`);
    }
    const field = findMediaField(widget, media.field);
    const ref = field?.actions?.[media.action];
    if (!field || !ref) {
        return [];
    }
    const data = await fetchSourceJson(dashboard.source, widget.source, { selection: { id: detail.row } });
    const resource = itemFrom(data, widget.source);
    const fields = { ...fieldValues(widget, resource), ...draft };
    const mediaVars = mediaActionVars(media);
    const files = media.files ?? (media.file ? [media.file] : []);
    if (!files.length) {
        return [
            await sendSourceJson(group.source.id, ref, endpointMethod(group, groups, ref), {
                resource,
                fields,
                media: mediaVars,
            }),
        ];
    }
    return Promise.all(
        files.map((file) => {
            const body = new FormData();
            body.set("file", file);
            return sendSourceForm(
                group.source.id,
                ref,
                endpointMethod(group, groups, ref),
                { resource, fields, media: mediaVars },
                body,
            );
        }),
    );
}

async function fetchActionResource(sourceId: string, widget: DetailWidget, row: string): Promise<unknown> {
    const data = await fetchSourceJson(sourceId, widget.source, { selection: { id: row } });
    return itemFrom(data, widget.source);
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
