import {
    JsonRecord,
    createHarness,
    createShipment,
    expect,
    jsonBody,
    relayPoints,
    sourceRequest,
    test,
    validShipmentBody,
} from "../support";

export function registerShipmentReadTests(): void {
    test("lists 24R relay points and excludes lockers through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await relayPoints(harness, {
            country: "FR",
            postalCode: "75001",
            city: "Paris",
            weightGrams: "500",
            limit: "3",
        });
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body.items).toEqual([
            {
                location: "FR-034439",
                number: "034439",
                country: "FR",
                name: "ARS INFORMATIQUE",
                label: "ARS INFORMATIQUE - 75001 - PARIS",
                addressLine1: "38 RUE MAUCONSEIL",
                addressLine2: "",
                postalCode: "75001",
                city: "PARIS",
                latitude: 48.8641433,
                longitude: 2.3470309,
                nature: "1",
                pointType: "relay_point",
                available: true,
                warning: "",
                photo: "",
                openingHoursHtml: "",
                shippingAmount: 450,
                currency: "eur",
            },
        ]);
        expect(harness.relayLookupUrl()?.searchParams.get("Brand")).toBe("TTMRSDBX");
        expect(harness.relayLookupUrl()?.searchParams.get("PostCode")).toBe("75001");
        expect(harness.relayLookupUrl()?.searchParams.get("ColLivMod")).toBe("24R");
        expect(harness.relayLookupUrl()?.searchParams.get("Weight")).toBe("500");
    });

    test("creates a Connect shipment through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await createShipment(harness, validShipmentBody());
        const body = await jsonBody(response);

        expect(response.status).toBe(201);
        expect(body).toEqual({
            ok: true,
            id: harness.insertedShipments[0]?.id,
            expeditionNumber: "00435394",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
        });
        expect(harness.connectRequestXml()).toContain('<DeliveryMode Mode="24R" Location="FR-031270" />');
        expect(harness.connectRequestXml()).toContain('<CollectionMode Mode="CCC" Location="" />');
        expect(harness.connectRequestXml()).toContain('<Weight Value="500" Unit="gr" />');
        expect(harness.connectRequestXml()).toContain('<ShipmentValue Currency="EUR" Amount="123.45" />');
        expect(harness.connectRequestXml()).toContain("<Culture>fr-FR</Culture>");
        expect(harness.connectRequestXml()).toContain("<OutputFormat>10x15</OutputFormat>");
        expect(harness.connectRequestXml()).toContain("<PhoneNo>+33600000000</PhoneNo>");
        expect(harness.connectRequestXml()).toContain("<HouseNo>17B</HouseNo>");
        expect(harness.connectRequestXml()).toContain("<Streetname>Chemin du Fond du Val</Streetname>");
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            external_order_id: "order-1001",
            expedition_number: "00435394",
            tracking_number: "00435394",
            status: "label_ready",
            delivery_relay_country: "FR",
            delivery_relay_number: "FR-031270",
            mode_collection: "CCC",
            mode_delivery: "24R",
            recipient_postal_code: "76930",
            recipient_city: "Octeville-sur-Mer",
            sender_phone: "+33600000000",
            recipient_phone: "+33600000000",
            weight_grams: 500,
            declared_value_minor_amount: 12345,
            declared_currency: "EUR",
            package_count: 1,
            created_by: "user-123",
        });
        expect(harness.insertedShipments[0]?.raw_request).toMatchObject({
            deliveryRelayLocation: "FR-031270",
            widthCm: 20,
            heightCm: 10,
            content: "Books",
        });
        expect(harness.insertedShipments[0]?.raw_response).toMatchObject({
            modeSandbox: true,
            statuses: [{ code: "0", level: "Info", message: "Success" }],
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
            ["PATCH", "/rest/v1/shipments"],
        ]);
        expect(harness.providerRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["POST", "/api/shipment"],
        ]);
        expect(harness.fetchTimeline()).toEqual([
            { kind: "postgrest", method: "GET", pathname: "/rest/v1/settings" },
            { kind: "postgrest", method: "POST", pathname: "/rest/v1/rpc/reserve_shipment_creation" },
            { kind: "provider", method: "POST", pathname: "/api/shipment" },
            { kind: "postgrest", method: "PATCH", pathname: "/rest/v1/shipments" },
        ]);
        expect(harness.postgrestRequests()[1]?.body).toMatchObject({
            p_reservation: {
                status: "creating",
                external_order_id: "order-1001",
                seller_cms_user_id: "seller-42",
                delivery_quote_id: `mrq_${"a".repeat(64)}`,
            },
        });
        expect((harness.postgrestRequests()[1]?.body as JsonRecord)?.p_reservation).not.toHaveProperty(
            "expedition_number",
        );
        expect(harness.postgrestRequests()[2]?.body).toMatchObject({
            status: "label_ready",
            expedition_number: "00435394",
            tracking_number: "00435394",
        });
    });

    test("returns the exact admin shipment detail by id or expedition with ordered events", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const shipment = harness.insertedShipments[0]!;
        Object.assign(shipment, {
            last_error: null,
            recipient_address_line2: null,
            latest_event_label: "Disponible au Point Relais",
            latest_event_at: "2026-07-14T11:00:00.000Z",
            carrier_accepted_at: "2026-07-13T08:00:00.000Z",
            arrived_at_pickup_point_at: "2026-07-14T10:45:00.000Z",
            available_for_pickup_at: "2026-07-14T11:00:00.000Z",
            recipient_handoff_at: null,
            pickup_expired_at: null,
            returning_to_sender_at: null,
            returned_to_sender_at: null,
            incident_at: null,
            lost_at: null,
            seller_handoff_declared_at: null,
        });
        harness.shipmentEvents.push(
            {
                id: 2,
                shipment_id: shipment.id,
                order_public_id: "order-1001",
                expedition_number: "00435394",
                provider_event_key: "event-latest",
                normalized_status: "available_for_pickup",
                occurred_at: "2026-07-14T11:00:00.000Z",
                event_label: "Disponible au Point Relais",
                event_date: "14/07/2026",
                event_time: "11:00",
                location: "PARIS",
                created_at: "2026-07-14T11:01:00.000Z",
            },
            {
                id: 1,
                shipment_id: shipment.id,
                order_public_id: "order-1001",
                expedition_number: "00435394",
                provider_event_key: "event-created",
                normalized_status: "in_transit",
                occurred_at: null,
                event_label: "Prise en charge agence",
                event_date: null,
                event_time: null,
                location: null,
                created_at: "2026-07-13T08:00:00.000Z",
            },
        );
        const expected = {
            id: shipment.id,
            externalOrderId: "order-1001",
            expeditionNumber: "00435394",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
            lastError: null,
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            recipientName: "Client Test",
            recipientEmail: "recipient@example.test",
            recipientPhone: "+33600000000",
            recipientAddressLine1: "17B Chemin du Fond du Val",
            recipientAddressLine2: null,
            recipientPostalCode: "76930",
            recipientCity: "Octeville-sur-Mer",
            recipientCountry: "FR",
            weightGrams: 500,
            packageCount: 1,
            latestEventLabel: "Disponible au Point Relais",
            latestEventAt: "2026-07-14T11:00:00.000Z",
            carrierAcceptedAt: "2026-07-13T08:00:00.000Z",
            arrivedAtPickupPointAt: "2026-07-14T10:45:00.000Z",
            availableForPickupAt: "2026-07-14T11:00:00.000Z",
            recipientHandoffAt: null,
            pickupExpiredAt: null,
            returningToSenderAt: null,
            returnedToSenderAt: null,
            incidentAt: null,
            lostAt: null,
            sellerHandoffDeclaredAt: null,
            events: [
                {
                    eventLabel: "Disponible au Point Relais",
                    eventDate: "14/07/2026",
                    eventTime: "11:00",
                    normalizedStatus: "available_for_pickup",
                    occurredAt: "2026-07-14T11:00:00.000Z",
                    location: "PARIS",
                },
                {
                    eventLabel: "Prise en charge agence",
                    eventDate: null,
                    eventTime: null,
                    normalizedStatus: "in_transit",
                    occurredAt: null,
                    location: null,
                },
            ],
            deliveryRelayLocation: "FR-031270",
        };

        for (const params of [{ id: String(shipment.id) }, { expeditionNumber: "00435394" }]) {
            harness.resetRequestHistory();
            const response = await sourceRequest(harness, "shipment", {
                method: "GET",
                userId: "admin-1",
                userRole: "admin",
                enforceAccess: true,
                params,
            });

            expect(response.status).toBe(200);
            const detail = await jsonBody(response);
            expect(detail).toEqual(expected);
            for (const privateField of ["senderEmail", "metadata", "rawResponse", "labelUrl"]) {
                expect(detail).not.toHaveProperty(privateField);
            }
            expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                ["GET", "/rest/v1/shipments"],
            ]);
            const shipmentRequest = harness.postgrestRequests()[0]!;
            expect(shipmentRequest.searchParams[params.id ? "id" : "expedition_number"]).toBe(
                `eq.${params.id ?? params.expeditionNumber}`,
            );
            expect(shipmentRequest.searchParams).toMatchObject({
                "events.order": "occurred_at.desc.nullslast,created_at.desc",
            });
            expect(shipmentRequest.searchParams.select).toContain(
                "events:shipment_events!shipment_events_shipment_id_fkey(",
            );
            expect(harness.providerRequests()).toEqual([]);
        }

        harness.resetRequestHistory();
        const byExternalOrder = await sourceRequest(harness, "shipmentForExternalOrder", {
            method: "GET",
            userId: "system",
            userRole: "system",
            enforceAccess: true,
            params: { externalOrderId: "order-1001" },
        });
        expect(byExternalOrder.status).toBe(200);
        expect(await jsonBody(byExternalOrder)).toEqual({
            items: [
                {
                    id: shipment.id,
                    expeditionNumber: "00435394",
                    status: "label_ready",
                    trackingUrl:
                        "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
                    deliveryRelayLocation: "FR-031270",
                    latestEventLabel: "Disponible au Point Relais",
                    latestEventAt: "2026-07-14T11:00:00.000Z",
                    carrierAcceptedAt: "2026-07-13T08:00:00.000Z",
                    sellerHandoffDeclaredAt: null,
                    recipientHandoffAt: null,
                    createdAt: "2026-07-02T10:00:00.000Z",
                    events: expected.events,
                },
            ],
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
        expect(harness.postgrestRequests()[0]?.searchParams).toMatchObject({
            external_order_id: "eq.order-1001",
            order: "created_at.desc",
            "events.order": "occurred_at.desc.nullslast,created_at.desc",
        });
        const externalOrderSelect = harness.postgrestRequests()[0]?.searchParams.select ?? "";
        for (const privateField of [
            "recipient_name",
            "recipient_email",
            "recipient_phone",
            "recipient_address",
            "recipient_postal_code",
            "recipient_city",
            "recipient_country",
            "sender_",
            "raw_",
        ]) {
            expect(externalOrderSelect).not.toContain(privateField);
        }
        expect(harness.providerRequests()).toEqual([]);

        harness.resetRequestHistory();
        const forbiddenExternalOrderLookup = await sourceRequest(harness, "shipmentForExternalOrder", {
            method: "GET",
            userId: "member-1",
            userRole: "member",
            enforceAccess: true,
            params: { externalOrderId: "order-1001" },
        });
        expect(forbiddenExternalOrderLookup.status).toBe(403);
        expect(await forbiddenExternalOrderLookup.text()).toBe("Forbidden");
        expect(harness.postgrestRequests()).toEqual([]);
        expect(harness.providerRequests()).toEqual([]);

        for (const caller of [
            { userId: "", userRole: "member", status: 401, body: "Unauthorized" },
            { userId: "member-1", userRole: "member", status: 403, body: "Forbidden" },
        ]) {
            harness.resetRequestHistory();
            const response = await sourceRequest(harness, "shipment", {
                method: "GET",
                userId: caller.userId,
                userRole: caller.userRole,
                enforceAccess: true,
                params: { id: String(shipment.id) },
            });
            expect(response.status).toBe(caller.status);
            expect(await response.text()).toBe(caller.body);
            expect(harness.postgrestRequests()).toEqual([]);
            expect(harness.providerRequests()).toEqual([]);
        }

        const missingHarness = await createHarness();
        const missing = await sourceRequest(missingHarness, "shipment", {
            method: "GET",
            userId: "admin-1",
            userRole: "admin",
            enforceAccess: true,
            responseProjectionMode: "compatibility",
            params: { id: "missing-shipment" },
        });
        expect(missing.status).toBe(404);
        expect(await jsonBody(missing)).toEqual({ error: "shipment not found" });
        expect(missingHarness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
        expect(missingHarness.providerRequests()).toEqual([]);

        missingHarness.resetRequestHistory();
        const noShipmentForOrder = await sourceRequest(missingHarness, "shipmentForExternalOrder", {
            method: "GET",
            userId: "system",
            userRole: "system",
            enforceAccess: true,
            params: { externalOrderId: "order-without-shipment" },
        });
        expect(noShipmentForOrder.status).toBe(200);
        expect(await jsonBody(noShipmentForOrder)).toEqual({ items: [] });
        expect(missingHarness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
        expect(missingHarness.providerRequests()).toEqual([]);
    });
}
