import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";

export function group(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:newsletter",
            id: "newsletter",
            name: "Newsletter",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "exportSubscriptions",
                method: "GET",
                targetUrl: "https://project.supabase.co/functions/v1/cms-newsletter/subscriptions/export",
                responseKind: "file",
                mediaType: "text/csv",
                params: [
                    { name: "q", in: "query", type: "string" },
                    { name: "subscribed", in: "query", type: "boolean" },
                ],
            },
        ],
        dashboards: [],
    };
}

export function dashboard(): DashboardDto {
    return {
        id: "newsletter-subscriptions",
        source: "newsletter",
        views: [
            {
                widget: "w-table",
                id: "subscriptionsTable",
                source: { endpoint: "listSubscriptions", itemsPath: "subscriptions" },
                rowKey: "email",
                columns: [{ id: "email", label: "Email", path: "email", primary: true }],
                actions: [
                    {
                        id: "exportSubscriptions",
                        label: "Export CSV",
                        endpoint: {
                            endpoint: "exportSubscriptions",
                            params: { q: "$filter.q", subscribed: "$filter.subscribed" },
                        },
                        download: { filename: "newsletter-subscriptions.csv" },
                    },
                ],
            },
        ],
    };
}

export function tableActionGroup(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:newsletter",
            id: "newsletter",
            name: "Newsletter",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "clearQueue",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/cms-newsletter/queue/clear",
                params: [],
            },
        ],
        dashboards: [],
    };
}

export function tableActionDashboard(): DashboardDto {
    return {
        id: "newsletter-queue",
        source: "newsletter",
        views: [
            {
                widget: "w-table",
                id: "queueTable",
                source: { endpoint: "listQueue", itemsPath: "items" },
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id", primary: true }],
                actions: [
                    {
                        id: "clearQueue",
                        label: "Clear queue",
                        endpoint: { endpoint: "clearQueue" },
                    },
                ],
            },
        ],
    };
}
