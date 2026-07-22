import {
    connectEndpoint,
    createHarness,
    createShipment,
    expect,
    jsonBody,
    sourceRequest,
    test,
    validShipmentBody,
} from "../support";

export function registerProviderErrorTests(): void {
    test("returns Connect provider status errors without leaking the password", async () => {
        const harness = await createHarness({
            connectStatusCode: "10001",
            connectStatusLevel: "Error",
            connectStatusMessage: "Invalid login or password",
        });
        const response = await createShipment(harness, validShipmentBody());
        const body = await jsonBody(response);

        expect(response.status).toBe(502);
        expect(body).toEqual({
            error: "Upstream request failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
        expect(JSON.stringify(body)).not.toContain("connect-password");
        expect(JSON.stringify(body)).not.toContain(connectEndpoint);
        expect(JSON.stringify(body)).not.toContain("TTMRSDBX");
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "failed",
            last_error: "Mondial Relay Connect returned status 10001: Invalid login or password",
        });
    });

    test("retries one explicit provider rejection through the same reserved shipment", async () => {
        const harness = await createHarness({
            connectResponses: [
                { code: "10001", level: "Error", message: "Temporary provider rejection" },
                { code: "0", level: "Info", message: "Success" },
            ],
        });
        const first = await createShipment(harness, validShipmentBody());
        const shipmentId = harness.insertedShipments[0]?.id;
        const retry = await createShipment(harness, validShipmentBody());

        expect(first.status).toBe(502);
        expect(await jsonBody(first)).toEqual({
            error: "Upstream request failed",
            correlationId: first.headers.get("x-correlation-id"),
        });
        expect(retry.status).toBe(201);
        expect(await jsonBody(retry)).toEqual({
            ok: true,
            id: shipmentId,
            expeditionNumber: "00435394",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
        });
        expect(harness.connectRequestCount()).toBe(2);
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            id: shipmentId,
            status: "label_ready",
            expedition_number: "00435394",
            last_error: null,
        });
    });

    test("does not automatically retry an ambiguous Connect network failure", async () => {
        const harness = await createHarness({ connectNetworkError: true });
        const first = await createShipment(harness, validShipmentBody());
        const retry = await createShipment(harness, validShipmentBody());

        expect(first.status).toBe(502);
        expect(await jsonBody(first)).toEqual({
            error: "Upstream request failed",
            correlationId: first.headers.get("x-correlation-id"),
        });
        expect(retry.status).toBe(409);
        expect(await jsonBody(retry)).toEqual({
            error: "shipment creation outcome is unknown and requires reconciliation",
        });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "unknown",
            last_error: "Mondial Relay Connect request failed",
        });

        const recovered = await sourceRequest(harness, "recoverUnknownShipment", {
            method: "POST",
            userId: "admin-7",
            body: {
                shipmentId: String(harness.insertedShipments[0]?.id),
                externalOrderId: "order-1001",
                expeditionNumber: "87654321",
                reason: "Matched against the provider back office after the timeout",
            },
        });
        expect(recovered.status).toBe(200);
        expect(await jsonBody(recovered)).toMatchObject({
            externalOrderId: "order-1001",
            expeditionNumber: "87654321",
            status: "created",
        });
        expect(harness.shipmentRecoveryEvents).toEqual([
            expect.objectContaining({
                actor_cms_user_id: "admin-7",
                previous_status: "unknown",
                expedition_number: "87654321",
            }),
        ]);

        const replay = await sourceRequest(harness, "recoverUnknownShipment", {
            method: "POST",
            userId: "admin-7",
            body: {
                shipmentId: String(harness.insertedShipments[0]?.id),
                externalOrderId: "order-1001",
                expeditionNumber: "87654321",
                reason: "Retry after the first recovery response was lost",
            },
        });
        expect(replay.status).toBe(200);
        expect(await jsonBody(replay)).toMatchObject({
            externalOrderId: "order-1001",
            expeditionNumber: "87654321",
            status: "created",
            idempotentReplay: true,
        });
        expect(harness.shipmentRecoveryEvents).toHaveLength(1);
        expect(harness.connectRequestCount()).toBe(1);
    });
}
