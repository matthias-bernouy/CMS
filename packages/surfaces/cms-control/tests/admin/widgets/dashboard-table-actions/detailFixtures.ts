import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../../../src/components/admin/Resources/Dashboards/types";

export function deliveryGroup(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:delivery",
            id: "delivery",
            name: "Delivery",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "createShipment",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/cms-delivery/shipments",
                params: [],
            },
        ],
        dashboards: [],
    };
}

export function schemaInvalidatingDeliveryGroup(): DashboardSourceGroup {
    const group = deliveryGroup();
    group.endpoints[0]!.effects = { invalidatesSchema: true };
    return group;
}

export function deliveryDashboard(): DashboardDto {
    return {
        id: "delivery-delivery",
        source: "delivery",
        views: [
            {
                widget: "w-detail",
                id: "createShipmentForm",
                source: { endpoint: "setting", params: { id: "default" } },
                title: { path: "externalOrderId", fallback: "Create shipment" },
                actions: [
                    {
                        id: "createShipment",
                        label: "Create shipment",
                        endpoint: {
                            endpoint: "createShipment",
                            body: { recipientName: "$field.recipientName" },
                        },
                        after: { opens: "shipmentDetail", row: "$result.id" },
                    },
                ],
                main: [
                    {
                        id: "recipient",
                        title: "Recipient",
                        fields: [{ id: "recipientName", label: "Recipient", path: "recipientName", type: "text" }],
                    },
                ],
            },
            {
                widget: "w-detail",
                id: "shipmentDetail",
                source: { endpoint: "shipment", params: { id: "$selection.id" } },
                title: { path: "expeditionNumber", fallback: "Shipment" },
                main: [
                    {
                        id: "shipmentGeneral",
                        title: "Shipment",
                        fields: [
                            { id: "expeditionNumber", label: "Expedition", path: "expeditionNumber", type: "readonly" },
                        ],
                    },
                ],
            },
        ],
    };
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
