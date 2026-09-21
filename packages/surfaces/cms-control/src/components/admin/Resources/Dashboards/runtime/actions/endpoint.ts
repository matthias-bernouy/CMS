import type { DashboardAction } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../types";
import { resolveExpression } from "../expressions";
import { sendSourceDownload } from "../source";

export type DashboardActionResult =
    | { kind: "navigation"; collection: string; row: string }
    | { kind: "download"; blob: Blob; filename: string };

export async function executeEndpointAction(
    group: DashboardSourceGroup,
    groups: DashboardSourceGroup[],
    action: DashboardAction,
    vars: {
        selection?: Record<string, unknown>;
        resource?: unknown;
        fields?: Record<string, unknown>;
        filters?: Record<string, unknown>;
        value?: unknown;
    },
): Promise<DashboardActionResult> {
    if (action.selection?.row !== undefined) {
        const row = resolveExpression(action.selection.row, vars);
        if (
            !action.selection.opens ||
            (typeof row !== "string" && typeof row !== "number") ||
            !String(row).trim() ||
            (typeof row === "number" && !Number.isFinite(row))
        ) {
            throw new Error("The navigation target is unavailable. Reload the detail before trying again.");
        }
        return { kind: "navigation", collection: action.selection.opens, row: String(row) };
    }
    if (!action.endpoint) {
        throw new Error(`Dashboard action "${action.id}" does not declare an endpoint`);
    }
    const method = endpointMethod(group, groups, action.endpoint);
    if (action.download) {
        const download = await sendSourceDownload(group.source.id, action.endpoint, method, vars);
        return {
            kind: "download",
            blob: download.blob,
            filename: action.download.filename ?? download.filename ?? `${action.id}.download`,
        };
    }
    throw new Error(`Dashboard action "${action.id}" must submit its native form`);
}

export function endpointMethod(
    group: DashboardSourceGroup,
    groups: DashboardSourceGroup[],
    ref: { sourceId?: string; endpoint: string },
): string {
    const sourceId = ref.sourceId ?? group.source.id;
    const sourceGroup = groups.find((candidate) => candidate.source.id === sourceId);
    const endpoint = sourceGroup?.endpoints.find((candidate) => candidate.endpointId === ref.endpoint);
    if (!endpoint) {
        throw new Error(`Dashboard endpoint "${sourceId}:${ref.endpoint}" was not found`);
    }
    return endpoint.method;
}
