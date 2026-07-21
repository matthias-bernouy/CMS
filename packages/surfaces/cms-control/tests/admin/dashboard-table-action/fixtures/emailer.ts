import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../../../src/components/admin/Resources/Dashboards/types";
import { withActionResource } from "../dashboard";

export function schemaInvalidatingEmailerGroup(): DashboardSourceGroup {
    const group = emailerGroup();
    group.endpoints[0]!.effects = { invalidatesSchema: true };
    return group;
}

export function emailerGroup(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:emailer",
            id: "emailer",
            name: "Emailer",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "updateSettings",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/cms-emailer/settings",
                params: [],
            },
        ],
        dashboards: [],
    };
}

export function emailerGroupWithDownload(): DashboardSourceGroup {
    const group = emailerGroup();
    group.endpoints.push({
        endpointId: "exportSettings",
        method: "GET",
        targetUrl: "https://project.supabase.co/functions/v1/cms-emailer/settings/export",
        responseKind: "file",
        mediaType: "text/csv",
        params: [],
    });
    return group;
}

export function emailerDashboard(): DashboardDto {
    return {
        id: "emailer-settings",
        source: "emailer",
        views: [
            {
                widget: "w-detail",
                id: "emailerSettings",
                source: { endpoint: "getSettings" },
                title: { path: "provider", fallback: "Settings" },
                actions: [
                    {
                        id: "saveSettings",
                        label: "Save settings",
                        endpoint: {
                            endpoint: "updateSettings",
                            body: { smtpHost: "$field.smtpHost" },
                        },
                    },
                ],
                main: [
                    {
                        id: "provider",
                        title: "Provider",
                        fields: [{ id: "smtpHost", label: "SMTP host", path: "smtpHost", type: "text" }],
                    },
                ],
            },
        ],
    };
}

export function emailerDashboardWithDownload(): DashboardDto {
    const dashboard = emailerDashboard();
    const widget = dashboard.views[0];
    if (!widget || widget.widget !== "w-detail") {
        throw new Error("Expected emailer settings detail");
    }
    widget.actions?.push({
        id: "exportSettings",
        label: "Export settings",
        endpoint: { endpoint: "exportSettings" },
        download: { filename: "settings.csv" },
    });
    return withActionResource(dashboard, "emailerSettings", "saveSettings", "$result");
}

export function emailerDashboardWithSameTarget(): DashboardDto {
    const dashboard = withActionResource(emailerDashboard(), "emailerSettings", "saveSettings", "$result");
    const widget = dashboard.views[0];
    if (!widget || widget.widget !== "w-detail" || !widget.actions?.[0]) {
        throw new Error("Expected emailer settings action");
    }
    widget.actions[0].after = {
        opens: "emailerSettings",
        row: "$selection.id",
        resource: "$result",
    };
    return dashboard;
}

export function overlappingSchemaActions(): { dashboard: DashboardDto; group: DashboardSourceGroup } {
    const dashboard = emailerDashboardWithSameTarget();
    const widget = dashboard.views[0];
    if (!widget || widget.widget !== "w-detail") {
        throw new Error("Expected emailer settings detail");
    }
    widget.actions?.push({
        id: "openDelivery",
        label: "Open delivery",
        endpoint: { endpoint: "openDelivery" },
        after: { opens: "deliveryDetail", row: "$result.id" },
    });
    const group = schemaInvalidatingEmailerGroup();
    group.endpoints.push({
        endpointId: "openDelivery",
        method: "POST",
        targetUrl: "https://project.supabase.co/functions/v1/emailer/delivery",
        params: [],
    });
    return { dashboard, group };
}
