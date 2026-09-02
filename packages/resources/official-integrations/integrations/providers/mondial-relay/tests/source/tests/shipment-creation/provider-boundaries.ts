import {
    JsonRecord,
    activeEnv,
    createHarness,
    createShipment,
    edgeCreateShipment,
    expect,
    jsonBody,
    setSettings,
    test,
    validShipmentBody,
} from "../../support";

export function registerProviderBoundaryTests(): void {
    test("rejects non-official Connect endpoints before sending credentials", async () => {
        const blockedEndpoints = [
            "http://connect-api.mondialrelay.com/api/shipment",
            "https://127.0.0.1/api/shipment",
            "https://connect-api.mondialrelay.com:444/api/shipment",
            "https://user:password@connect-api.mondialrelay.com/api/shipment",
            "https://connect-api.mondialrelay.com.evil.example/api/shipment",
        ];

        for (const endpoint of blockedEndpoints) {
            const harness = await createHarness();
            activeEnv.MONDIAL_RELAY_CONNECT_ENDPOINT = endpoint;
            const response = await edgeCreateShipment(harness, validShipmentBody());
            expect(response.status).toBe(500);
            expect(await jsonBody(response)).toMatchObject({
                error: "Mondial Relay Connect endpoint is not an allowed official endpoint",
            });
            expect(harness.connectRequestCount()).toBe(0);
            expect(harness.upstreamRequestUrls()).not.toContain(endpoint);
        }
    });

    test("does not follow Mondial Relay Connect redirects", async () => {
        const harness = await createHarness({ connectRedirect: true });
        const response = await edgeCreateShipment(harness, validShipmentBody());

        expect(response.status).toBe(502);
        expect(await jsonBody(response)).toMatchObject({ error: "Mondial Relay Connect redirects are not allowed" });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.connectRequestRedirect()).toBe("manual");
    });
}
