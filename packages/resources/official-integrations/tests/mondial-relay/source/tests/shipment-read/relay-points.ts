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

export function registerRelayPointReadTests(): void {
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
}
