import { connectEndpoint, createHarness, expect, test, trackingEndpoint, validateSource } from "../support";

export function registerInstallationTests(): void {
    test("installs only the Connect source backend", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:delivery");
        const dashboard = await harness.dashboards.getDashboard("delivery-delivery");
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
        expect(dashboard).toBeNull();
        expect(harness.deployment?.dataApiSchemas).toEqual(["delivery"]);
        const functionSecrets = harness.deployment?.functions[0]?.secrets ?? {};
        expect(functionSecrets).toMatchObject({
            MONDIAL_RELAY_CONNECT_ENDPOINT: connectEndpoint,
            MONDIAL_RELAY_CONNECT_LOGIN: "connect-login",
            MONDIAL_RELAY_CONNECT_PASSWORD: "connect-password",
            MONDIAL_RELAY_CONNECT_CUSTOMER_ID: "TTMRSDBX",
            MONDIAL_RELAY_WIDGET_BRAND: "TTMRSDBX",
            MONDIAL_RELAY_TRACKING_ENDPOINT: trackingEndpoint,
            MONDIAL_RELAY_TRACKING_BRAND: "BDTEST",
            MONDIAL_RELAY_TRACKING_PRIVATE_KEY: "tracking-private-key",
        });
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_SENDER_NAME");
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_DEFAULT_MODE_COL");
        expect(harness.importedBlocs).toEqual([]);
    });
}
