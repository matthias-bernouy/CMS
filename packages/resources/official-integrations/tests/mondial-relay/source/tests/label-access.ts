import {
    activeEnv,
    createHarness,
    createShipment,
    expect,
    functionsBaseUrl,
    jsonBody,
    sourceRequest,
    test,
    validShipmentBody,
} from "../support";

export function registerLabelAccessTests(): void {
    test("proxies labels only through a short-lived capability bound to the seller", async () => {
        const harness = await createHarness();
        const created = await jsonBody(await createShipment(harness, validShipmentBody()));
        expect(created).not.toHaveProperty("labelUrl");

        const issued = await jsonBody(
            await sourceRequest(harness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );
        expect(issued.token).toEqual(expect.any(String));
        expect(harness.labelAccessTokens[0]).toMatchObject({
            shipment_id: harness.insertedShipments[0]?.id,
            seller_cms_user_id: "seller-42",
        });
        expect(JSON.stringify(harness.labelAccessTokens)).not.toContain(String(issued.token));

        const labelResponse = await sourceRequest(harness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(issued.token) },
        });
        expect(labelResponse.status).toBe(200);
        expect(labelResponse.headers.get("cache-control")).toBe("private, no-store");
        expect(await labelResponse.text()).toContain("%PDF-1.4");
        const directLabelResponse = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-delivery/label?token=${encodeURIComponent(String(issued.token))}`, {
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                    "x-cms-user-id": "seller-42",
                },
            }),
        );
        expect(directLabelResponse.headers.get("content-disposition")).toStartWith("attachment;");
        expect(directLabelResponse.headers.get("x-content-type-options")).toBe("nosniff");

        const otherSeller = await sourceRequest(harness, "label", {
            method: "GET",
            userId: "seller-other",
            params: { token: String(issued.token) },
        });
        expect(otherSeller.status).toBe(404);
        const unrelatedMint = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-delivery/system/label-access`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ externalOrderId: "order-1001", sellerCmsUserId: "seller-other" }),
            }),
        );
        expect(unrelatedMint.status).toBe(404);
        expect(harness.labelAccessTokens).toHaveLength(1);
    });

    test("allows a label re-download after seller handoff but closes access on the first carrier scan", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        await sourceRequest(harness, "declareSellerHandoff", {
            method: "POST",
            userId: "seller-42",
            body: { externalOrderId: "order-1001" },
        });

        const afterHandoff = await sourceRequest(harness, "issueLabelAccess", {
            method: "POST",
            userId: "seller-42",
            body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
        });
        expect(afterHandoff.status).toBe(201);

        Object.assign(harness.insertedShipments[0]!, {
            status: "carrier_accepted",
            carrier_accepted_at: "2026-07-14T00:30:00.000Z",
        });
        const afterCarrierScan = await sourceRequest(harness, "issueLabelAccess", {
            method: "POST",
            userId: "seller-42",
            body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
        });
        expect(afterCarrierScan.status).toBe(409);
    });

    test("atomically revokes existing label capabilities when an unscanned shipment is cancelled", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const capability = await jsonBody(
            await sourceRequest(harness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );

        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(200);
        expect(await jsonBody(cancellation)).toMatchObject({ status: "cancelled_unscanned" });
        expect(harness.labelAccessTokens).toEqual([expect.objectContaining({ revoked_at: expect.any(String) })]);

        const providerRequestCount = harness.upstreamRequestUrls.length;
        const revokedDownload = await sourceRequest(harness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(capability.token) },
        });
        expect(revokedDownload.status).toBe(404);
        expect(harness.upstreamRequestUrls).toHaveLength(providerRequestCount);

        const mintAfterCancellation = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-delivery/system/label-access`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ externalOrderId: "order-1001", sellerCmsUserId: "seller-42" }),
            }),
        );
        expect(mintAfterCancellation.status).toBe(409);
        expect(harness.labelAccessTokens.filter((token) => !token.revoked_at)).toHaveLength(0);
    });
}
