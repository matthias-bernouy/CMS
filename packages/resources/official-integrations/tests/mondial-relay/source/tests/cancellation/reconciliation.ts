import { createHarness, createShipment, expect, jsonBody, sourceRequest, test, validShipmentBody } from "../../support";

export function registerCancellationReconciliationTests(): void {
    test("keeps an expired local cancellation in manual review on STAT 83", async () => {
        const harness = await createHarness({ trackingStatusCode: "83" });
        await createShipment(harness, validShipmentBody());
        await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        harness.insertedShipments[0]!.cancellation_tracking_until = "2026-07-01T00:00:00.000Z";

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-stat83-worker", limit: 5 },
            }),
        );

        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
        ]);
        expect(batch.events).toEqual([
            expect.objectContaining({ orderPublicId: "order-1001", normalizedStatus: "incident" }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "manual_review",
            incident_at: expect.any(String),
            last_error: "carrier activity or ambiguity observed after local shipment cancellation",
        });
    });

    test("keeps an expired local cancellation in manual review on ambiguous recipient evidence", async () => {
        for (const trackingEventLabel of [
            "Colis non remis au destinataire",
            "Colis remis au destinataire avec réserve",
        ]) {
            const harness = await createHarness({ trackingEventLabel });
            await createShipment(harness, validShipmentBody());
            await sourceRequest(harness, "cancelShipmentReservation", {
                method: "POST",
                userId: "system",
                body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
            });
            harness.insertedShipments[0]!.cancellation_tracking_until = "2026-07-01T00:00:00.000Z";

            const batch = await jsonBody(
                await sourceRequest(harness, "reconcileShipments", {
                    method: "POST",
                    userId: "system",
                    body: { runKey: `cancelled-ambiguous-worker-${trackingEventLabel}`, limit: 5 },
                }),
            );

            expect(batch.shipments).toEqual([
                expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
            ]);
            expect(batch.events).toEqual([
                expect.objectContaining({ orderPublicId: "order-1001", normalizedStatus: "incident" }),
            ]);
            expect(harness.insertedShipments[0]).toMatchObject({
                status: "manual_review",
                incident_at: "2026-07-12T09:30:00.000Z",
            });
        }
    });

    test("never restores a pre-cancellation status when a neutral reconciliation loses the cancellation CAS", async () => {
        const harness = await createHarness({
            trackingStatusCode: "80",
            cancellationRaceOnReconciliation: "cancelled_unscanned",
        });
        await createShipment(harness, validShipmentBody());

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-neutral-cas-worker", limit: 5 },
            }),
        );

        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "cancelled_unscanned" }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "cancelled_unscanned",
            cancellation_tracking_until: "2099-07-12T09:30:00.000Z",
            last_error: "cancellation committed during reconciliation",
            tracking_claimed_at: null,
            tracking_claimed_by: null,
        });
    });

    test("moves a cancellation CAS race to manual review when the late result is an incident", async () => {
        const harness = await createHarness({
            trackingStatusCode: "83",
            cancellationRaceOnReconciliation: "cancelled_unscanned",
        });
        await createShipment(harness, validShipmentBody());

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-incident-cas-worker", limit: 5 },
            }),
        );

        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "manual_review",
            cancellation_tracking_until: "2099-07-12T09:30:00.000Z",
            last_error: "carrier activity or ambiguity raced with local shipment cancellation",
            incident_at: expect.any(String),
        });
    });
}
