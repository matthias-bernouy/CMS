export const DELIVERY_DEFINITION = {
    kind: "delivery",
    label: "Delivery",
    inputs: [],
    artifacts: [
        {
            type: "source",
            source: {
                id: "delivery",
                meta: { name: "Delivery" },
                endpoints: [
                    {
                        endpointId: "createShipment",
                        method: "POST",
                        targetUrl: "https://example.com/shipments",
                        params: [],
                    },
                    {
                        endpointId: "relayPoints",
                        method: "GET",
                        targetUrl: "https://example.com/relay-points",
                        params: [
                            { name: "country", in: "query", type: "string" },
                            { name: "postalCode", in: "query", type: "string" },
                            { name: "city", in: "query", type: "string" },
                            { name: "limit", in: "query", type: "number" },
                        ],
                    },
                ],
            },
        },
        {
            type: "dashboard",
            dashboard: {
                id: "delivery",
                source: "delivery",
                views: [{
                    widget: "w-detail",
                    id: "shipmentDetail",
                    source: { endpoint: "relayPoints", params: { country: "FR" }, itemPath: "item" },
                    actions: [{
                        id: "create",
                        label: "Create shipment",
                        placement: "primary",
                        endpoint: { endpoint: "createShipment" },
                    }],
                    main: [{
                        id: "shipment",
                        title: "Shipment",
                        fields: [
                            {
                                id: "recipientCountry",
                                label: "Recipient country",
                                path: "recipientCountry",
                                type: "select",
                                options: ["FR"],
                                required: true,
                            },
                            {
                                id: "deliveryRelayNumber",
                                label: "Pickup point",
                                path: "deliveryRelayNumber",
                                type: "combobox",
                                required: true,
                                lookup: {
                                    endpoint: "relayPoints",
                                    params: {
                                        country: "FR",
                                        postalCode: "$field.recipientPostalCode",
                                        city: "$field.recipientCity",
                                        limit: "10",
                                    },
                                    itemsPath: "items",
                                    valuePath: "number",
                                    labelPath: "name",
                                    subtitlePath: "city",
                                    descriptionPaths: ["addressLine1", "postalCode", "city"],
                                },
                            },
                            {
                                id: "options",
                                label: "Options",
                                path: "options",
                                type: "tokens",
                                allowCustom: true,
                                visibleWhen: {
                                    value: "$field.recipientCountry",
                                    equals: "FR",
                                },
                            },
                        ],
                    }],
                }],
            },
        },
    ],
};

export const EXPECTED_DELIVERY_DASHBOARD = {
    type: "dashboard",
    dashboard: {
        id: "delivery",
        source: "delivery",
        views: [{
            widget: "w-detail",
            id: "shipmentDetail",
            source: { endpoint: "relayPoints", params: { country: "FR" }, itemPath: "item" },
            actions: [{
                id: "create",
                label: "Create shipment",
                placement: "primary",
                endpoint: { endpoint: "createShipment" },
            }],
            main: [{
                id: "shipment",
                title: "Shipment",
                fields: [
                    {
                        id: "recipientCountry",
                        label: "Recipient country",
                        path: "recipientCountry",
                        type: "select",
                        options: [{ value: "FR", label: "FR" }],
                        required: true,
                    },
                    {
                        id: "deliveryRelayNumber",
                        label: "Pickup point",
                        path: "deliveryRelayNumber",
                        type: "combobox",
                        required: true,
                        lookup: {
                            endpoint: "relayPoints",
                            params: {
                                country: "FR",
                                postalCode: "$field.recipientPostalCode",
                                city: "$field.recipientCity",
                                limit: "10",
                            },
                            itemsPath: "items",
                            valuePath: "number",
                            labelPath: "name",
                            subtitlePath: "city",
                            descriptionPaths: ["addressLine1", "postalCode", "city"],
                        },
                    },
                    {
                        id: "options",
                        label: "Options",
                        path: "options",
                        type: "tokens",
                        allowCustom: true,
                        visibleWhen: {
                            value: "$field.recipientCountry",
                            equals: "FR",
                        },
                    },
                ],
            }],
        }],
    },
};
