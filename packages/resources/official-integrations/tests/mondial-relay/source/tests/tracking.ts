import {
    JsonRecord,
    activeEnv,
    createHarness,
    createShipment,
    edgeTracking,
    expect,
    jsonBody,
    sourceRequest,
    test,
    tracking,
    validShipmentBody,
} from "../support";

export function registerTrackingTests(): void {
    test("synchronizes and stores tracking events through the official SOAP WebService", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const response = await tracking(harness, "00435394");
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            expeditionNumber: "00435394",
            status: "arrived_at_pickup_point",
            latestEventLabel: "Colis livré au destinataire",
            recipientHandoffAt: "",
        });
        expect(body.events).toHaveLength(2);
        expect(body.events[0]).toMatchObject({
            eventLabel: "Livré",
            eventDate: "2026-07-12",
            eventTime: "11:30",
            location: "PARIS",
        });
        expect(body.events[0]).not.toHaveProperty("projectionClaimToken");
        expect(body.events[0]).not.toHaveProperty("projectionStatus");
        expect(body.events[0]).not.toHaveProperty("projectionLastError");
        expect(body.events[0]).not.toHaveProperty("providerEventKey");
        expect(harness.trackingRequestXml()).toContain("<Enseigne>BDTEST</Enseigne>");
        expect(harness.trackingRequestXml()).toContain("<Expedition>00435394</Expedition>");
        expect(harness.trackingRequestXml()).toMatch(/<Security>[A-F0-9]{32}<\/Security>/);
        expect(harness.trackingRequestXml()).not.toContain("tracking-private-key");
        expect(harness.insertedShipments[0]).toMatchObject({ status: "arrived_at_pickup_point" });
        // Keep the raw provider event for auditability and persist the conservative
        // normalized summary as a separate Commerce projection event.
        expect(harness.shipmentEvents).toHaveLength(2);

        const cached = await tracking(harness, "00435394");
        expect(cached.status).toBe(200);
        expect(harness.trackingRequestCount()).toBe(1);
    });

    test("rejects non-official tracking endpoints before sending the signed SOAP request", async () => {
        const blockedEndpoints = [
            "http://api.mondialrelay.com/WebService.asmx",
            "https://127.0.0.1/WebService.asmx",
            "https://api.mondialrelay.com:444/WebService.asmx",
            "https://brand:key@api.mondialrelay.com/WebService.asmx",
            "https://api.mondialrelay.com.evil.example/WebService.asmx",
        ];

        for (const endpoint of blockedEndpoints) {
            const harness = await createHarness();
            await createShipment(harness, validShipmentBody());
            activeEnv.MONDIAL_RELAY_TRACKING_ENDPOINT = endpoint;
            const response = await edgeTracking(harness, "00435394");
            expect(response.status).toBe(500);
            expect(await jsonBody(response)).toMatchObject({
                error: "Mondial Relay tracking endpoint is not an allowed official endpoint",
            });
            expect(harness.trackingRequestCount()).toBe(0);
            expect(harness.upstreamRequestUrls()).not.toContain(endpoint);
        }
    });

    test("does not follow Mondial Relay tracking redirects", async () => {
        const harness = await createHarness({ trackingRedirect: true });
        await createShipment(harness, validShipmentBody());
        const response = await edgeTracking(harness, "00435394");

        expect(response.status).toBe(502);
        expect(await jsonBody(response)).toMatchObject({ error: "Mondial Relay tracking redirects are not allowed" });
        expect(harness.trackingRequestCount()).toBe(1);
        expect(harness.trackingRequestRedirect()).toBe("manual");
    });

    test("records recipient_handoff_at only from an explicit dated collection event", async () => {
        const harness = await createHarness({ trackingEventLabel: "Colis remis au destinataire" });
        await createShipment(harness, validShipmentBody());
        const body = await jsonBody(await tracking(harness, "00435394"));

        expect(body).toMatchObject({
            status: "collected_by_recipient",
            recipientHandoffAt: "2026-07-12T09:30:00.000Z",
        });
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "collected_by_recipient",
            recipient_handoff_at: "2026-07-12T09:30:00.000Z",
        });
        expect(body.events[0]).toMatchObject({
            normalizedStatus: "collected_by_recipient",
            occurredAt: "2026-07-12T09:30:00.000Z",
        });
    });

    test("keeps seller handoff separate from first scan and closes cancellation races", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const handoff = await jsonBody(
            await sourceRequest(harness, "declareSellerHandoff", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001" },
            }),
        );
        expect(handoff).toMatchObject({
            status: "label_ready",
            sellerHandoffDeclaredAt: expect.any(String),
        });
        expect(handoff.carrierAcceptedAt).toBeUndefined();

        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(409);

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "delivery-worker-1", limit: 25 },
            }),
        );
        expect(batch.processed).toBe(1);
        expect(batch.events).toEqual([
            expect.objectContaining({
                orderPublicId: "order-1001",
                normalizedStatus: "arrived_at_pickup_point",
                providerReference: "00435394",
            }),
        ]);
        const event = batch.events[0] as JsonRecord;
        const acknowledged = await jsonBody(
            await sourceRequest(harness, "acknowledgeShipmentEvent", {
                method: "POST",
                userId: "system",
                body: { eventId: event.eventId, claimToken: event.claimToken },
            }),
        );
        expect(acknowledged).toEqual({ acknowledged: true });
        const replay = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "delivery-worker-2", limit: 24 },
            }),
        );
        expect(replay.events).toEqual([]);
    });
}
