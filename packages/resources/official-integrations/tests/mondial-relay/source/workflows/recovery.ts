import {
    createHarness,
    createShipment,
    expect,
    inProgressShipment,
    jsonBody,
    setSystemTime,
    sourceRequest,
    test,
    validShipmentBody,
} from "../support";

export function registerRecoveryTests(): void {
    test("quarantines a stale in-progress creation before any second provider call", async () => {
        const harness = await createHarness();
        harness.insertedShipments.push(inProgressShipment("2020-01-01T00:00:00.000Z"));

        const response = await createShipment(harness, validShipmentBody());

        expect(response.status).toBe(409);
        expect(await jsonBody(response)).toEqual({
            error: "shipment creation outcome is unknown and requires administrator recovery",
        });
        expect(harness.connectRequestCount()).toBe(0);
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "unknown",
            creation_manual_review_at: expect.any(String),
            last_error: "shipment creation lease expired before a provider outcome was attached",
        });
    });

    test("keeps the Edge-clock creation lease boundary and recovery failure behavior", async () => {
        const now = new Date("2026-07-21T12:00:00.000Z");
        setSystemTime(now);
        try {
            const live = await createHarness();
            live.insertedShipments.push(inProgressShipment(new Date(now.getTime() - 20 * 60_000 + 1).toISOString()));
            const liveResponse = await createShipment(live, validShipmentBody());
            expect(liveResponse.status).toBe(409);
            expect(await jsonBody(liveResponse)).toEqual({
                error: "shipment creation is already in progress",
            });
            expect(live.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                ["GET", "/rest/v1/settings"],
                ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
            ]);
            expect(live.insertedShipments[0]?.status).toBe("creating");

            const stale = await createHarness();
            stale.insertedShipments.push(inProgressShipment(new Date(now.getTime() - 20 * 60_000).toISOString()));
            const staleResponse = await createShipment(stale, validShipmentBody());
            expect(staleResponse.status).toBe(409);
            expect(await jsonBody(staleResponse)).toEqual({
                error: "shipment creation outcome is unknown and requires administrator recovery",
            });
            expect(stale.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                ["GET", "/rest/v1/settings"],
                ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
                ["PATCH", "/rest/v1/shipments"],
            ]);
            expect(stale.insertedShipments[0]).toMatchObject({
                status: "unknown",
                creation_manual_review_at: now.toISOString(),
                last_error: "shipment creation lease expired before a provider outcome was attached",
            });
            expect(stale.providerRequests()).toEqual([]);

            for (const option of ["miss", "failure"] as const) {
                const harness = await createHarness(
                    option === "miss" ? { shipmentLeasePatchMiss: true } : { shipmentLeasePatchFailure: true },
                );
                harness.insertedShipments.push(inProgressShipment(new Date(now.getTime() - 20 * 60_000).toISOString()));
                const response = await createShipment(harness, validShipmentBody());
                expect(response.status).toBe(409);
                expect(await jsonBody(response)).toEqual({
                    error: "shipment creation outcome is unknown and requires administrator recovery",
                });
                expect(harness.insertedShipments[0]?.status).toBe("creating");
                expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                    ["GET", "/rest/v1/settings"],
                    ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
                    ["PATCH", "/rest/v1/shipments"],
                ]);
                expect(harness.providerRequests()).toEqual([]);
            }
        } finally {
            setSystemTime();
        }
    });

    test("moves stale creating reservations to visible manual review without retrying the provider", async () => {
        const harness = await createHarness();
        harness.insertedShipments.push(
            {
                id: "shipment-stale",
                external_order_id: "order-stale",
                idempotency_key: "order-stale",
                status: "creating",
                provider_call_started_at: "2020-01-01T00:00:00.000Z",
                creation_manual_review_at: null,
                expedition_number: null,
                created_at: "2020-01-01T00:00:00.000Z",
                updated_at: "2020-01-01T00:00:00.000Z",
            },
            {
                id: "shipment-live",
                external_order_id: "order-live",
                idempotency_key: "order-live",
                status: "creating",
                provider_call_started_at: new Date().toISOString(),
                creation_manual_review_at: null,
                expedition_number: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        );

        const response = await sourceRequest(harness, "reconcileShipments", {
            method: "POST",
            userId: "system",
            body: { runKey: "creation-lease-audit", limit: 8 },
        });
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body.staleCreations).toEqual([
            expect.objectContaining({
                id: "shipment-stale",
                externalOrderId: "order-stale",
                status: "unknown",
            }),
        ]);
        expect(harness.insertedShipments.find((row) => row.id === "shipment-stale")).toMatchObject({
            status: "unknown",
            creation_manual_review_at: expect.any(String),
        });
        expect(harness.insertedShipments.find((row) => row.id === "shipment-live")?.status).toBe("creating");
        expect(harness.connectRequestCount()).toBe(0);
    });
}
