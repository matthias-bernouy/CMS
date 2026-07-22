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
} from "../support";

export function registerRelaySelectionTests(): void {
    test("revalidates and stores a checkout relay selection without creating a shipment", async () => {
        const harness = await createHarness();
        const savedResponse = await saveRelaySelection(harness, {
            ...validDeliveryQuoteRequest("order-public-42"),
            externalOrderId: "order-public-42",
            relayLocation: "FR-034439",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
        });
        const saved = await jsonBody(savedResponse);

        expect(savedResponse.status).toBe(200);
        expect(saved).toEqual({
            quoteId: "mrq_12a24601fa17ea51f8af4b4a33a43c932d1c638945fda05f283ac297fa161054",
            externalOrderId: "order-public-42",
            orderVersion: 1,
            revision: 1,
            selectedForCmsUserId: "user-123",
            relayLocation: "FR-034439",
            country: "FR",
            number: "034439",
            name: "ARS INFORMATIQUE",
            addressLine1: "38 RUE MAUCONSEIL",
            addressLine2: "",
            postalCode: "75001",
            city: "PARIS",
            latitude: 48.8641433,
            longitude: 2.3470309,
            nature: "1",
            pointType: "relay_point",
            weightGrams: 500,
            shippingAmount: 450,
            currency: "eur",
            merchandiseSubtotalMinorAmount: 12_345,
            quotedAt: "2026-07-13T10:00:00.000Z",
            expiresAt: "2099-07-13T10:15:00.000Z",
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/read_relay_selection_setup_context"],
            ["POST", "/rest/v1/rpc/reserve_delivery_quote"],
        ]);
        expect(harness.providerRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/parcelshop-picker/v4_0/services/parcelshop-picker.svc/SearchPR"],
        ]);
        expect(harness.fetchTimeline()).toEqual([
            {
                kind: "postgrest",
                method: "POST",
                pathname: "/rest/v1/rpc/read_relay_selection_setup_context",
            },
            {
                kind: "provider",
                method: "GET",
                pathname: "/parcelshop-picker/v4_0/services/parcelshop-picker.svc/SearchPR",
            },
            { kind: "postgrest", method: "POST", pathname: "/rest/v1/rpc/reserve_delivery_quote" },
        ]);
        expect(
            harness.postgrestRequests().filter((request) => request.pathname === "/rest/v1/delivery_quotes"),
        ).toEqual([]);
        expect(harness.postgrestRequests()[1]?.body).toMatchObject({
            p_quote_id: "mrq_12a24601fa17ea51f8af4b4a33a43c932d1c638945fda05f283ac297fa161054",
            p_request_key: "quote-request:order-public-42:1:FR-034439",
            p_external_order_id: "order-public-42",
            p_order_version: 1,
            p_selected_by: "user-123",
            p_selected_for_cms_user_id: "user-123",
            p_relay_location: "FR-034439",
            p_weight_grams: 500,
            p_shipping_amount: 450,
            p_currency: "eur",
            p_merchandise_subtotal_minor_amount: 12_345,
            p_ttl_seconds: 900,
        });

        harness.resetRequestHistory();
        const loaded = await jsonBody(await relaySelection(harness, "order-public-42"));
        expect(loaded).toMatchObject({
            externalOrderId: "order-public-42",
            relayLocation: "FR-034439",
            name: "ARS INFORMATIQUE",
            nature: "1",
            pointType: "relay_point",
            weightGrams: 500,
            shippingAmount: 450,
            currency: "eur",
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/read_relay_selection_context"],
        ]);
        expect(harness.relaySelections).toHaveLength(0);
        expect(harness.deliveryQuotes).toContainEqual(
            expect.objectContaining({
                external_order_id: "order-public-42",
                relay_location: "FR-034439",
                relay_name: "ARS INFORMATIQUE",
                selected_by: "user-123",
                weight_grams: 500,
                shipping_amount: 450,
                currency: "eur",
            }),
        );
        expect(harness.relayLookupUrl()?.searchParams.get("NbResults")).toBe("8");
        expect(harness.insertedShipments).toHaveLength(0);

        const unavailable = await saveRelaySelection(harness, {
            ...validDeliveryQuoteRequest("order-public-43"),
            externalOrderId: "order-public-43",
            relayLocation: "FR-999999",
            country: "FR",
            postalCode: "75001",
        });
        expect(unavailable.status).toBe(409);
        expect(await jsonBody(unavailable)).toEqual({
            error: "the selected pickup point is unavailable or does not match the search area",
        });
        expect(harness.deliveryQuotes.filter((row) => row.external_order_id === "order-public-43")).toHaveLength(0);

        const locker = await saveRelaySelection(harness, {
            ...validDeliveryQuoteRequest("order-public-locker"),
            externalOrderId: "order-public-locker",
            relayLocation: "FR-024474",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
        });
        expect(locker.status).toBe(409);
        expect(await jsonBody(locker)).toEqual({
            error: "the selected pickup point is unavailable or does not match the search area",
        });
        expect(harness.deliveryQuotes.filter((row) => row.external_order_id === "order-public-locker")).toHaveLength(0);
    });

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

    test("fails closed when an exact quote is expired or bound to another buyer", async () => {
        const harness = await createHarness();
        harness.deliveryQuotes[0]!.expires_at = "2020-01-01T00:00:00.000Z";
        const expired = await sourceRequest(harness, "resolveDeliveryQuote", {
            method: "POST",
            userId: "system",
            body: {
                quoteId: harness.deliveryQuotes[0]!.quote_id,
                externalOrderId: "order-1001",
                selectedForCmsUserId: "user-123",
                purpose: "financial_lock",
            },
        });
        const wrongBuyer = await sourceRequest(harness, "resolveDeliveryQuote", {
            method: "POST",
            userId: "system",
            body: {
                quoteId: harness.deliveryQuotes[0]!.quote_id,
                externalOrderId: "order-1001",
                selectedForCmsUserId: "other-buyer",
                purpose: "fulfillment",
            },
        });

        expect(expired.status).toBe(409);
        expect(wrongBuyer.status).toBe(404);
    });
}
