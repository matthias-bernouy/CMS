import {
    JsonRecord,
    createHarness,
    createShipment,
    expect,
    jsonBody,
    sourceRequest,
    test,
    validShipmentBody,
} from "../support";

export function registerProjectionTests(): void {
    test("leases projection events, reclaims crashes, and dead-letters repeated failures", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const first = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-a", limit: 8 },
            }),
        );
        const claimed = first.events[0] as JsonRecord;
        expect(typeof claimed.eventId).toBe("number");
        expect(typeof claimed.claimToken).toBe("string");
        expect(claimed.projectionAttempts).toBe(1);

        const concurrent = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-b", limit: 8 },
            }),
        );
        expect(concurrent.events).toEqual([]);

        const stored = harness.shipmentEvents.find((event) => Number(event.id) === Number(claimed.eventId))!;
        if (!stored) {
            throw new Error("claimed projection event is missing from the harness");
        }
        stored.projection_claimed_at = "stale";
        const reclaimed = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-c", limit: 8 },
            }),
        );
        expect(reclaimed.events[0]).toMatchObject({
            eventId: claimed.eventId,
            projectionAttempts: 2,
        });
        expect((reclaimed.events[0] as JsonRecord).claimToken).not.toBe(claimed.claimToken);

        const retry = await jsonBody(
            await sourceRequest(harness, "failShipmentEventProjection", {
                method: "POST",
                userId: "system",
                body: {
                    eventId: claimed.eventId,
                    claimToken: (reclaimed.events[0] as JsonRecord).claimToken,
                    error: "Commerce temporarily unavailable",
                },
            }),
        );
        expect(retry).toMatchObject({ projectionStatus: "retry_wait", projectionAttempts: 2 });

        const finalClaim = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-d", limit: 8 },
            }),
        );
        stored.projection_attempts = 5;
        const manual = await jsonBody(
            await sourceRequest(harness, "failShipmentEventProjection", {
                method: "POST",
                userId: "system",
                body: {
                    eventId: claimed.eventId,
                    claimToken: (finalClaim.events[0] as JsonRecord).claimToken,
                    error: "Commerce permanently rejected the projection",
                },
            }),
        );
        expect(manual).toMatchObject({
            projectionStatus: "manual_review",
            projectionAttempts: 5,
            projectionLastError: "Commerce permanently rejected the projection",
        });

        const exceptions = await jsonBody(
            await sourceRequest(harness, "shipmentProjectionExceptions", {
                method: "GET",
                userId: "admin",
                params: { limit: "50", offset: "0" },
            }),
        );
        expect(exceptions.items).toEqual([
            expect.objectContaining({
                id: claimed.eventId,
                projectionStatus: "manual_review",
                projectionAttempts: 5,
            }),
        ]);

        const forbidden = await sourceRequest(harness, "reviewShipmentProjectionException", {
            method: "POST",
            userId: "legacy-support-operator",
            userRole: "support",
            body: {
                eventId: claimed.eventId,
                action: "requeue",
                reason: "Commerce projection endpoint has recovered",
            },
        });
        expect(forbidden.status).toBe(403);

        const requeued = await sourceRequest(harness, "reviewShipmentProjectionException", {
            method: "POST",
            userId: "admin-operator",
            userRole: "admin",
            body: {
                eventId: claimed.eventId,
                action: "requeue",
                reason: "Commerce projection endpoint has recovered",
            },
        });
        expect(requeued.status).toBe(200);
        expect(await jsonBody(requeued)).toMatchObject({
            id: claimed.eventId,
            projectionStatus: "retry_wait",
            projectionAttempts: 0,
        });
        expect(stored.normalized_status).toBe("arrived_at_pickup_point");
    });
}
