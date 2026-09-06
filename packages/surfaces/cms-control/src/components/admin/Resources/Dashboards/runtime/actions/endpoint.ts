import type { DashboardAction } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../types";
import { managementRequest } from "../../../Integrations/management/api";
import { resolveBody } from "../expressions";
import { sendSourceDownload, sendSourceJson } from "../source";

type ActionResultMeta = {
    after?: DashboardAction["after"];
    invalidatesSchema?: true;
};

export type DashboardActionResult =
    | ({ kind: "value"; value: unknown } & ActionResultMeta)
    | ({ kind: "download"; blob: Blob; filename: string } & ActionResultMeta);

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
    if (action.management) {
        const management = action.management;
        const input = resolveBody(management.body, vars) ?? vars.fields ?? {};
        const result = await managementRequest<{ values: unknown }>(
            management.installationId,
            management.action === "action" ? "action" : "settings",
            management.action === "action" ? { actionId: management.actionId, input } : input,
        );
        return { kind: "value", value: result.values, ...actionMeta(group, groups, action) };
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
            ...actionMeta(group, groups, action),
        };
    }
    return {
        kind: "value",
        value: await sendSourceJson(group.source.id, action.endpoint, method, vars),
        ...actionMeta(group, groups, action),
    };
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

function actionMeta(
    group: DashboardSourceGroup,
    groups: DashboardSourceGroup[],
    action: DashboardAction,
): ActionResultMeta {
    return {
        ...(action.after ? { after: action.after } : {}),
        ...(action.endpoint && endpointInvalidatesSchema(group, groups, action.endpoint)
            ? { invalidatesSchema: true }
            : {}),
    };
}

function endpointInvalidatesSchema(
    group: DashboardSourceGroup,
    groups: DashboardSourceGroup[],
    ref: { sourceId?: string; endpoint: string },
): boolean {
    const sourceId = ref.sourceId ?? group.source.id;
    return (
        groups
            .find((candidate) => candidate.source.id === sourceId)
            ?.endpoints.find((endpoint) => endpoint.endpointId === ref.endpoint)?.effects?.invalidatesSchema === true
    );
}
