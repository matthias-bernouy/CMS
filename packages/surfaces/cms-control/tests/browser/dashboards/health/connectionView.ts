import type { DashboardField, DashboardWidget } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "cms-control/api/_platform/dashboards.get";
export function connectionGroups(fields: DashboardField[]): DashboardSourceGroup[] {
    const detail: DashboardWidget = {
        widget: "w-detail",
        id: "connection",
        title: { path: "label", fallback: "Connection" },
        source: { endpoint: "getConnection" },
        save: {
            endpoint: "saveConnection",
            label: "Save settings",
            valuesPath: "values",
            hiddenFields: [
                { name: "expectedRevision", value: "$resource.savedRevision", type: "string", empty: "omit" },
            ],
        },
        main: [
            {
                id: "connection",
                title: "Connection",
                fields: fields.map((field) => ({ ...field, name: field.path, path: `values.${field.path}` })),
            },
        ],
    };
    return [
        {
            source: {
                id: "service",
                urn: "urn:service",
                name: "Service",
                dashboardCount: 1,
                endpointCount: 2,
                readonly: false,
            },
            endpoints: [
                {
                    endpointId: "getConnection",
                    method: "GET",
                    targetUrl: "https://provider.test/connection",
                    params: [],
                },
                {
                    endpointId: "saveConnection",
                    method: "POST",
                    targetUrl: "https://provider.test/connection",
                    params: [],
                },
            ],
            dashboards: [
                { id: "service-connection", source: "service", meta: { name: "Connection" }, views: [detail] },
            ],
        },
    ];
}
