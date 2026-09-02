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
} from "../../support";

export function registerShipmentCreationReadTests(): void {
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
}
