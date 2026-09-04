import { InMemoryDashboardViewRepository, type DashboardViewDefinition } from "@bernouy/cms-dashboards";

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
        type: "dashboard-view" as const,
        view: {
            schemaVersion: 2 as const,
            id,
            source,
            meta: { name: id },
            view: {
                id,
                label: id,
                widgets: [
                    {
                        widget: "w-table" as const,
                        id: "itemsTable",
                        source: { endpoint: "list", itemsPath: "items" },
                        rowKey: "id",
                        columns: [{ id: "id", label: "ID", path: "id" }],
                    },
                ],
            },
            availability: { catalog: true, defaultPlacement: { dashboardId: id } },
        },
    };
}

export class FailingCreateDashboardViewRepository extends InMemoryDashboardViewRepository {
    constructor(private readonly failId: string) {
        super();
    }

    override createView(view: DashboardViewDefinition): Promise<DashboardViewDefinition> {
        if (view.id === this.failId) {
            throw new Error(`dashboard view create failed for ${view.id}`);
        }
        return super.createView(view);
    }
}
