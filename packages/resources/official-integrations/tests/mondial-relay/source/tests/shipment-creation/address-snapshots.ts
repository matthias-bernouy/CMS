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

export function registerAddressSnapshotTests(): void {
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
}
