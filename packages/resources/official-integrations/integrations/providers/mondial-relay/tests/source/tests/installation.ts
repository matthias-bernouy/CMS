import {
    type JsonRecord,
    connectEndpoint,
    createHarness,
    dashboardViewAsLegacyDashboard,
    expect,
    test,
    trackingEndpoint,
    validateDashboard,
    validateSource,
} from "../support";

export function registerInstallationTests(): void {
    test("installs the Connect source and dashboard", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:delivery");
        const view = await harness.dashboardViews.getView("delivery-delivery");
        const dashboard = view ? dashboardViewAsLegacyDashboard(view) : null;
        const createEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:createShipment");
        const createBody = createEndpoint?.input?.body;
        const saveSelection = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:saveRelaySelection");
        const resolveQuote = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:resolveDeliveryQuote");
        const deliveryQuote = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:deliveryQuote");
        const issueLabelAccess = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:issueLabelAccess");

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:delivery:relayPoints");
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:delivery:saveRelaySelection");
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:delivery:relaySelection");
        expect(createBody?.properties?.deliveryRelayLocation).toEqual({ type: "string" });
        expect(createBody?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        expect(createBody?.properties?.selectedForCmsUserId?.semantic?.authority).toBe("cms");
        expect(saveSelection?.input?.body?.properties?.selectedForCmsUserId?.semantic?.authority).toBe("cms");
        expect(resolveQuote?.input?.body?.properties?.selectedForCmsUserId?.semantic?.authority).toBe("cms");
        expect(
            deliveryQuote?.input?.params?.find((param) => param.name === "selectedForCmsUserId")?.schema?.semantic
                ?.authority,
        ).toBe("cms");
        expect(issueLabelAccess?.input?.body?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        expect(createBody?.properties).not.toHaveProperty("deliveryRelayNumber");
        expect(createBody?.properties).not.toHaveProperty("sizeCode");
        expect(createBody?.properties).not.toHaveProperty("insuranceLevel");
        expect(dashboard).toBeTruthy();
        expect(validateDashboard(dashboard!, { source: source! })).toEqual([]);
        const views = dashboard?.views as JsonRecord[] | undefined;
        expect(views?.map((item) => `${item.widget}:${item.id}`)).toEqual([
            "w-table:shipmentsTable",
            "w-table:projectionExceptionsTable",
            "w-detail:shipmentDetail",
            "w-detail:settingsDetail",
        ]);
        const shipmentsTable = views?.[0];
        const tableActions = shipmentsTable?.actions as JsonRecord[] | undefined;
        expect(tableActions?.map((action) => action.id)).toEqual(["openSettings"]);
        expect(tableActions?.[0]).toMatchObject({ selection: { opens: "settingsDetail" } });
        const settingsDetail = dashboard?.views.find((item) => item.id === "settingsDetail");
        if (settingsDetail?.widget !== "w-detail") {
            throw new Error("delivery settings detail not installed");
        }
        expect(settingsDetail.actions?.find((action) => action.id === "saveSettings")?.after).toEqual({
            resource: "$result",
        });
        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).toContain("recoverUnknownShipment");
        expect(dashboardJson).not.toContain("createShipmentForm");
        expect(dashboardJson).not.toContain('"widget":"w-tabs"');
        expect(dashboardJson).not.toContain('"id":"pickupPoints"');
        expect(dashboardJson).not.toContain('"id":"relayPointsTable"');
        expect(dashboardJson).toContain("Edit settings");
        expect(dashboardJson).toContain("Sender address");
        expect(dashboardJson).toContain("Default weight grams");
        expect(dashboardJson).not.toContain('"path":"labelUrl"');
        expect(harness.deployment?.dataApiSchemas).toEqual(["delivery"]);
        const functionSecrets = harness.deployment?.functions[0]?.secrets ?? {};
        expect(Object.keys(functionSecrets)).toEqual(["CMS_DELIVERY_API_KEY"]);
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_SENDER_NAME");
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_DEFAULT_MODE_COL");
        expect(harness.importedBlocs).toEqual([]);
    });
}
