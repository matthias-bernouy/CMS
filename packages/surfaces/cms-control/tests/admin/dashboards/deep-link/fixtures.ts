import { DashboardView } from "cms-control/components/admin/Resources/Dashboards/DashboardView";
import { DetailResourceState } from "cms-control/components/admin/Resources/Dashboards/domain";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";

export const selectedDashboard = "commerce-configuration";
export const groups: DashboardSourceGroup[] = [
    {
        source: {
            urn: "urn:commerce",
            id: "commerce",
            name: "Commerce",
            endpointCount: 1,
            dashboardCount: 2,
            readonly: false,
        },
        endpoints: [],
        dashboards: [
            { id: "commerce-products", source: "commerce", meta: { name: "Products" }, views: [] },
            { id: selectedDashboard, source: "commerce", meta: { name: "Settings" }, views: [] },
        ],
    },
];

export type DashboardViewInternals = {
    clearDetail: () => void;
    detailResource: DetailResourceState;
    detailSelection: { collection: string; row: string } | null;
    groups: DashboardSourceGroup[];
    openDetail: (collection: string, row: string) => void;
    reloadDetail: (collection: string, row: string) => void;
    reloadDefinitions: () => Promise<void>;
    selectedDashboard: string;
    selectedSource: string;
};

export function dashboardViewInternals(): DashboardViewInternals {
    const component = new DashboardView() as unknown as DashboardViewInternals;
    component.groups = groups;
    component.selectedSource = "commerce";
    component.selectedDashboard = selectedDashboard;
    return component;
}

export function groupsWithFirstDashboard(id: string): DashboardSourceGroup[] {
    const next = structuredClone(groups);
    next[0]!.dashboards[0]!.id = id;
    return next;
}

export function actionDefinitionGroups(includeForm: boolean): DashboardSourceGroup[] {
    const detail = (id: string, endpoint: string) => ({
        widget: "w-detail" as const,
        id,
        source: { endpoint },
        main: [],
    });
    return [
        {
            source: {
                urn: "urn:commerce",
                id: "commerce",
                name: "Commerce",
                endpointCount: 2,
                dashboardCount: 1,
                readonly: false,
            },
            endpoints: [],
            dashboards: [
                {
                    id: selectedDashboard,
                    source: "commerce",
                    views: [
                        ...(includeForm ? [detail("createForm", "create")] : []),
                        detail("createdDetail", "detail"),
                    ],
                },
            ],
        },
    ];
}
