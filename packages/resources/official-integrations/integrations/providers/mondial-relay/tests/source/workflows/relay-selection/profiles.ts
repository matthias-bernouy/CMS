import {
    JsonRecord,
    createHarness,
    expect,
    jsonBody,
    relaySelection,
    saveRelaySelection,
    sourceRequest,
    test,
    validDeliveryQuoteRequest,
} from "../../support";

export function registerRelayProfileTests(): void {
    test("normalizes Commerce buyer names from given/surname and first/last fields", async () => {
        const cases = [
            {
                input: { givenName: "Alice", surname: "Acheteuse" },
                expected: ["Alice Acheteuse", "Alice", "Acheteuse"],
            },
            { input: { firstName: "Benoit", lastName: "Client" }, expected: ["Benoit Client", "Benoit", "Client"] },
        ] as const;

        for (const [index, testCase] of cases.entries()) {
            const externalOrderId = `order-buyer-name-${index + 1}`;
            const harness = await createHarness();
            const base = validDeliveryQuoteRequest(externalOrderId);
            const response = await saveRelaySelection(harness, {
                ...base,
                externalOrderId,
                relayLocation: "FR-034439",
                country: "FR",
                postalCode: "75001",
                city: "Paris",
                recipientSnapshot: {
                    ...testCase.input,
                    phone: "+33600000000",
                    addressLine1: "17B Chemin du Fond du Val",
                    addressLine2: "",
                    addressLine3: "",
                    postalCode: "76930",
                    city: "Octeville-sur-Mer",
                    countryCode: "FR",
                    email: "recipient@example.test",
                },
            });

            expect(response.status).toBe(200);
            expect(harness.deliveryQuotes).toContainEqual(
                expect.objectContaining({
                    external_order_id: externalOrderId,
                    recipient_snapshot: expect.objectContaining({
                        name: testCase.expected[0],
                        firstName: testCase.expected[1],
                        lastName: testCase.expected[2],
                    }),
                }),
            );
        }
    });

    test("strictly replays one immutable quote and rejects changed profiles under the same request key", async () => {
        const harness = await createHarness();
        const request = {
            ...validDeliveryQuoteRequest("order-public-42"),
            externalOrderId: "order-public-42",
            relayLocation: "FR-034439",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
        };

        const first = await jsonBody(await saveRelaySelection(harness, request));
        const replay = await jsonBody(await saveRelaySelection(harness, request));
        const changed = await saveRelaySelection(harness, {
            ...request,
            sellerFulfillmentSnapshot: {
                ...(request.sellerFulfillmentSnapshot as JsonRecord),
                addressLine1: "99 rue modifiée après la première tentative",
            },
        });

        expect(replay.quoteId).toBe(first.quoteId);
        expect(replay.revision).toBe(first.revision);
        expect(harness.deliveryQuotes.filter((row) => row.external_order_id === "order-public-42")).toHaveLength(1);
        expect(changed.status).toBe(409);
        expect(await jsonBody(changed)).toMatchObject({
            error: expect.stringContaining("replay changed immutable input"),
        });
    });

    test("rejects incomplete buyer or seller fulfillment data before creating any quote", async () => {
        const cases: Array<[string, JsonRecord]> = [
            [
                "buyer",
                {
                    recipient: "Buyer",
                    phone: "",
                    addressLine1: "1 rue",
                    postalCode: "75001",
                    city: "Paris",
                    countryCode: "FR",
                },
            ],
            [
                "seller",
                {
                    givenName: "Seller",
                    surname: "Name",
                    phone: "+33611111111",
                    addressLine1: "",
                    postalCode: "69001",
                    city: "Lyon",
                    countryCode: "FR",
                },
            ],
        ];
        for (const [kind, incomplete] of cases) {
            const harness = await createHarness();
            const base = validDeliveryQuoteRequest(`order-incomplete-${kind}`);
            const response = await saveRelaySelection(harness, {
                ...base,
                externalOrderId: `order-incomplete-${kind}`,
                relayLocation: "FR-034439",
                country: "FR",
                postalCode: "75001",
                city: "Paris",
                ...(kind === "buyer" ? { recipientSnapshot: incomplete } : { sellerFulfillmentSnapshot: incomplete }),
            });
            expect(response.status).toBe(409);
            expect(
                harness.deliveryQuotes.filter((row) => row.external_order_id === `order-incomplete-${kind}`),
            ).toHaveLength(0);
            expect(harness.connectRequestCount()).toBe(0);
        }
    });
}
