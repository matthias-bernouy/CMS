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

export function registerShipmentReplayTests(): void {
    test("replays a completed shipment without creating a second Mondial Relay shipment", async () => {
        const harness = await createHarness();
        const first = await createShipment(harness, validShipmentBody());
        harness.resetRequestHistory();
        const replay = await createShipment(harness, validShipmentBody());

        expect(first.status).toBe(201);
        expect(replay.status).toBe(200);
        expect(await jsonBody(replay)).toEqual({
            ok: true,
            id: harness.insertedShipments[0]?.id,
            expeditionNumber: "00435394",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
            idempotentReplay: true,
        });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
        ]);
        expect(harness.providerRequests()).toEqual([]);
    });

    test("rejects an immutable quote bound to another buyer before reserving or calling Connect", async () => {
        const harness = await createHarness();
        const response = await createShipment(harness, {
            ...validShipmentBody(),
            selectedForCmsUserId: "another-buyer",
        });

        expect(response.status).toBe(409);
        expect(await jsonBody(response)).toEqual({ error: "shipment delivery quote binding is invalid" });
        expect(harness.insertedShipments).toEqual([]);
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
        ]);
        expect(harness.providerRequests()).toEqual([]);
    });

    test("accepts the exact five-key Commerce metadata contract on lost-response recovery", async () => {
        const harness = await createHarness();
        const body = {
            ...validShipmentBody(),
            metadata: {
                commerceOrderId: "order-1001",
                financialTermsHash: "terms-hash-1001",
                deliveryQuoteId: `mrq_${"a".repeat(64)}`,
                declaredValueMinorAmount: 12_345,
                declaredCurrency: "EUR",
            },
        };
        const first = await createShipment(harness, body);
        const recovered = await createShipment(harness, { ...body, metadata: { ...body.metadata } });

        expect(first.status).toBe(201);
        expect(recovered.status).toBe(200);
        expect(await jsonBody(recovered)).toMatchObject({ idempotentReplay: true, expeditionNumber: "00435394" });
        expect(harness.connectRequestCount()).toBe(1);
    });

    test("rejects an idempotency replay when immutable shipment input changed", async () => {
        const harness = await createHarness();
        const first = await createShipment(harness, validShipmentBody());
        const changed = { ...validShipmentBody(), deliveryRelayLocation: "FR-024474" };
        const replay = await createShipment(harness, changed);

        expect(first.status).toBe(201);
        expect(replay.status).toBe(409);
        expect(await jsonBody(replay)).toMatchObject({
            error: "shipment financial or relay input does not match the immutable quote",
        });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.insertedShipments).toHaveLength(1);
    });
}
