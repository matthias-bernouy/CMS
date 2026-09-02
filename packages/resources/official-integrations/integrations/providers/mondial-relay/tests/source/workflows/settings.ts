import {
    JsonRecord,
    createHarness,
    createShipment,
    expect,
    jsonBody,
    setSettings,
    sourceRequest,
    test,
    validShipmentBody,
} from "../support";

export function registerSettingsTests(): void {
    test("updates delivery settings through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await setSettings(harness, {
            modeCollection: "REL",
            modeDelivery: "24R",
            customerReference: "shop42",
            senderName: "Updated Shop",
            senderAddressLine1: "2 Rue Test",
            senderPostalCode: "69001",
            senderCity: "Lyon",
            senderCountry: "FR",
            senderPhone: "+330608138404",
            defaultWeightGrams: 750,
            defaultPackageCount: 1,
            defaultLengthCm: 32,
            defaultWidthCm: 22,
            defaultHeightCm: 12,
            defaultContent: "Updated goods",
            declaredCurrency: "EUR",
            connectCulture: "fr-FR",
            connectVersionApi: "1.0",
            connectOutputFormat: "10x15",
            connectOutputType: "PdfUrl",
        });
        const body = await jsonBody(response);
        const fetched = await jsonBody(
            await sourceRequest(harness, "setting", {
                method: "GET",
                userId: "cms-admin",
                params: { id: "default" },
            }),
        );

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            id: "default",
            modeCollection: "REL",
            customerReference: "SHOP42",
            senderName: "Updated Shop",
            senderPhone: "+33608138404",
            defaultWeightGrams: 750,
        });
        expect(body).toEqual(fetched);

        harness.deliveryQuotes[0]!.seller_fulfillment_snapshot = {
            name: "Updated Shop",
            firstName: "Updated",
            lastName: "Shop",
            phone: "+33608138404",
            addressLine1: "2 Rue Test",
            addressLine2: "",
            addressLine3: "",
            postalCode: "69001",
            city: "Lyon",
            country: "FR",
            email: "sender@example.test",
        };
        (harness.deliveryQuotes[0]!.recipient_snapshot as JsonRecord).phone = "+33608138404";

        const shipmentBody = {
            ...validShipmentBody(),
            modeCollection: undefined,
            recipientPhone: "+330608138404",
            content: undefined,
        };
        const shipmentResponse = await createShipment(harness, shipmentBody);
        expect(shipmentResponse.status).toBe(201);
        expect(harness.connectRequestXml()).toContain("<Firstname>Updated</Firstname>");
        expect(harness.connectRequestXml()).toContain('<CollectionMode Mode="REL" Location="" />');
        expect(harness.connectRequestXml()).toContain("<CustomerNo>SHOP42</CustomerNo>");
        expect(harness.connectRequestXml()).toContain("<Lastname>Shop</Lastname>");
        expect(harness.connectRequestXml()).toContain("<PhoneNo>+33608138404</PhoneNo>");
        expect(harness.insertedShipments.at(-1)).toMatchObject({
            mode_collection: "REL",
            sender_name: "Updated Shop",
            sender_phone: "+33608138404",
            recipient_phone: "+33608138404",
        });
    });

    test("rejects invalid phone values through the installed CMS source", async () => {
        const harness = await createHarness();
        const settingsResponse = await setSettings(harness, { senderPhone: "+abc" });
        const settingsBody = await jsonBody(settingsResponse);

        expect(settingsResponse.status).toBe(400);
        expect(settingsBody.error).toBe("senderPhone must use E.164 international format");

        const shipmentResponse = await createShipment(harness, { ...validShipmentBody(), recipientPhone: "phone" });
        const shipmentBody = await jsonBody(shipmentResponse);

        expect(shipmentResponse.status).toBe(400);
        expect(shipmentBody.error).toBe("recipient.phone must use E.164 international format");
    });

    test("rejects an invalid customer reference through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await setSettings(harness, { customerReference: "COURTSIDE-TOO-LONG" });
        const body = await jsonBody(response);

        expect(response.status).toBe(400);
        expect(body.error).toBe("customerReference must contain 1 to 9 letters or digits");
    });
}
