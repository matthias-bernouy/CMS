import { createHarness, createShipment, expect, jsonBody, sourceRequest, test, validShipmentBody } from "../support";

export function registerLabelValidationTests(): void {
    test("rejects non-provider label URLs and non-PDF label responses", async () => {
        const invalidUrlHarness = await createHarness({ labelUrl: "https://internal.example.test/admin" });
        const invalidCreation = await createShipment(invalidUrlHarness, validShipmentBody());
        expect(invalidCreation.status).toBe(400);
        expect(invalidUrlHarness.insertedShipments).toHaveLength(1);
        expect(invalidUrlHarness.insertedShipments[0]).toMatchObject({
            status: "unknown",
            last_error: "Mondial Relay label URL is not an allowed provider URL",
        });

        const htmlHarness = await createHarness({ labelContentType: "text/html" });
        await createShipment(htmlHarness, validShipmentBody());
        const issued = await jsonBody(
            await sourceRequest(htmlHarness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );
        const response = await sourceRequest(htmlHarness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(issued.token) },
        });
        expect(response.status).toBe(502);

        const redirectHarness = await createHarness({ labelRedirect: true });
        await createShipment(redirectHarness, validShipmentBody());
        const redirectCapability = await jsonBody(
            await sourceRequest(redirectHarness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );
        const redirectResponse = await sourceRequest(redirectHarness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(redirectCapability.token) },
        });
        expect(redirectResponse.status).toBe(502);
    });
}
