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
} from "../support";

export function registerShipmentCreationTests(): void {
    test("keeps explicit empty flat seller fields when matching the immutable quote snapshot", async () => {
        const harness = await createHarness();
        const settingsResponse = await setSettings(harness, {
            senderAddressLine2: "GLOBAL ADDRESS LINE 2",
            senderAddressLine3: "GLOBAL ADDRESS LINE 3",
            senderEmail: "global-sender@example.test",
        });
        expect(settingsResponse.status).toBe(200);
        harness.deliveryQuotes[0]!.seller_fulfillment_snapshot = {
            ...(harness.deliveryQuotes[0]!.seller_fulfillment_snapshot as JsonRecord),
            addressLine2: "",
            addressLine3: "",
            email: "",
        };

        const response = await createShipment(harness, {
            ...validShipmentBody(),
            senderName: "Sender Shop",
            senderFirstName: "Sender",
            senderLastName: "Shop",
            senderEmail: "",
            senderPhone: "+33600000000",
            senderAddressLine1: "1 Rue Test",
            senderAddressLine2: "",
            senderAddressLine3: "",
            senderPostalCode: "75001",
            senderCity: "Paris",
            senderCountry: "FR",
        });

        expect(response.status).toBe(201);
        expect(harness.connectRequestXml()).not.toContain("GLOBAL ADDRESS LINE");
        expect(harness.connectRequestXml()).not.toContain("global-sender@example.test");
        expect(harness.insertedShipments[0]?.raw_request).toMatchObject({
            senderAddressLine2: "",
            senderAddressLine3: "",
            senderEmail: "",
        });
    });

    test("keeps explicit empty nested aliases and does not replace an empty required field", async () => {
        const nestedHarness = await createHarness();
        const settingsResponse = await setSettings(nestedHarness, {
            senderAddressLine2: "GLOBAL NESTED ADDRESS LINE 2",
            senderAddressLine3: "GLOBAL NESTED ADDRESS LINE 3",
            senderEmail: "global-nested@example.test",
        });
        expect(settingsResponse.status).toBe(200);
        nestedHarness.deliveryQuotes[0]!.seller_fulfillment_snapshot = {
            ...(nestedHarness.deliveryQuotes[0]!.seller_fulfillment_snapshot as JsonRecord),
            addressLine2: "",
            addressLine3: "",
            email: "",
        };

        const nestedResponse = await edgeCreateShipment(nestedHarness, {
            ...validShipmentBody(),
            sender: {
                name: "Sender Shop",
                firstname: "Sender",
                lastname: "Shop",
                email: "",
                phoneNo: "+33600000000",
                address1: "1 Rue Test",
                address2: "",
                address3: "",
                postal_code: "75001",
                city: "Paris",
                country: "FR",
            },
        });
        expect(nestedResponse.status).toBe(201);
        expect(nestedHarness.connectRequestXml()).not.toContain("GLOBAL NESTED ADDRESS LINE");
        expect(nestedHarness.connectRequestXml()).not.toContain("global-nested@example.test");

        const invalidHarness = await createHarness();
        const invalidResponse = await createShipment(invalidHarness, {
            ...validShipmentBody(),
            senderAddressLine1: "",
        });
        expect(invalidResponse.status).toBe(400);
        expect(await jsonBody(invalidResponse)).toEqual({ error: "sender.addressLine1 is required" });
        expect(invalidHarness.connectRequestCount()).toBe(0);
    });

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
