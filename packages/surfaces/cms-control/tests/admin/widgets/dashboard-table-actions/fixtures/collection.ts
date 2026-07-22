import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";

export function collectionActionGroup(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:collection-actions",
            id: "collection-actions",
            name: "Collection actions",
            endpointCount: 2,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "createFirst",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/collection-actions/first",
                params: [],
            },
            {
                endpointId: "createSecond",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/collection-actions/second",
                params: [],
            },
        ],
        dashboards: [],
    };
}

export function collectionActionDashboard(): DashboardDto {
    return {
        id: "collection-actions",
        source: "collection-actions",
        views: [
            {
                widget: "w-table",
                id: "queueTable",
                source: { endpoint: "queue", itemsPath: "items" },
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id", primary: true }],
                actions: [
                    {
                        id: "createFirst",
                        label: "Create first",
                        endpoint: { endpoint: "createFirst" },
                        after: { opens: "firstDetail", row: "$result.id", resource: "$result" },
                    },
                    {
                        id: "createSecond",
                        label: "Create second",
                        endpoint: { endpoint: "createSecond" },
                        after: { opens: "secondDetail", row: "$result.id", resource: "$result" },
                    },
                ],
            },
        ],
    };
}
