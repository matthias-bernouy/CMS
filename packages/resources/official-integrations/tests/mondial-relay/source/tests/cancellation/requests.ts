import { createHarness, createShipment, expect, jsonBody, sourceRequest, test, validShipmentBody } from "../../support";

export function registerCancellationRequestTests(): void {
    test("replays the exact terminal cancellation after its tracking deadline has expired", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        Object.assign(harness.insertedShipments[0]!, {
            status: "cancelled",
            cancellation_tracking_until: "2026-07-01T00:00:00.000Z",
        });

        const replay = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2026-07-01T00:00:00.000Z" },
        });
        expect(replay.status).toBe(200);
        expect(await jsonBody(replay)).toMatchObject({ status: "cancelled" });

        const changedDeadline = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-13T09:30:00.000Z" },
        });
        expect(changedDeadline.status).toBe(409);
    });

    test("refuses cancellation while a carrier reconciliation lease can observe the first scan", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        Object.assign(harness.insertedShipments[0]!, {
            tracking_claimed_at: new Date().toISOString(),
            tracking_claimed_by: "active-first-scan-worker",
        });

        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(409);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "label_ready",
            tracking_claimed_by: "active-first-scan-worker",
        });
    });

    test("keeps tracking a locally cancelled label and escalates a late carrier scan", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(200);

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-scan-worker", limit: 5 },
            }),
        );
        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
        ]);
        expect(batch.events).toEqual([
            expect.objectContaining({
                orderPublicId: "order-1001",
                normalizedStatus: "arrived_at_pickup_point",
            }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "manual_review",
            last_error: "carrier activity or ambiguity observed after local shipment cancellation",
        });
    });
}
