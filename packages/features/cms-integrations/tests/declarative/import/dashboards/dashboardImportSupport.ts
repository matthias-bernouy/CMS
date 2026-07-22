import { InMemoryDashboardRepository, type Dashboard } from "@bernouy/cms-dashboards";

export function overlayLookupDefinition(selected: unknown) {
    return {
        kind: "delivery-overlay",
        label: "Delivery overlay",
        inputs: [],
        artifacts: [
            {
                type: "sourceOverlay",
                overlay: {
                    id: "delivery-fields",
                    sourceId: "delivery",
                    fields: [],
                    dashboardFields: [
                        {
                            viewId: "shipmentDetail",
                            fieldId: "deliveryRelayNumber",
                            field: {
                                type: "combobox",
                                lookup: { endpoint: "relayPoints", valuePath: "number", labelPath: "name", selected },
                            },
                        },
                    ],
                },
            },
        ],
    };
}

export function dashboardArtifact(id: string, source: string) {
    return {
        type: "dashboard" as const,
        dashboard: {
            id,
            source,
            views: [
                {
                    widget: "w-table" as const,
                    id: "itemsTable",
                    source: { endpoint: "list", itemsPath: "items" },
                    rowKey: "id",
                    columns: [{ id: "id", label: "ID", path: "id" }],
                },
            ],
        },
    };
}

export class FailingCreateDashboardRepository extends InMemoryDashboardRepository {
    constructor(private readonly failId: string) {
        super();
    }

    override createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        if (dashboard.id === this.failId) {
            throw new Error(`dashboard create failed for ${dashboard.id}`);
        }
        return super.createDashboard(dashboard);
    }
}
