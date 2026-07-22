import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../../harness";
import { callsSince, expectNoStorage, fetchCount } from "./assertions";
import {
    activeOfferRow,
    offerImageMediaId,
    type OfferImageFixtureOptions,
    useOfferImageResponder,
    verifiedOwnerRow,
} from "./fixtures";

installCommerceTestEnvironment();

describe("commerce public offer image visibility", () => {
    test("returns the same image 404 before Storage for absent and inactive offers", async () => {
        const scenarios: OfferImageFixtureOptions[] = [
            { offerMedia: null },
            { offer: null },
            { offer: { ...activeOfferRow, publication_status: "draft" } },
            { offer: { ...activeOfferRow, publication_status: "paused" } },
        ];

        for (const options of scenarios) {
            useOfferImageResponder(options);
            const before = fetchCount();
            const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`);
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 404,
                body: { error: "offer image not found" },
            });
            expectNoStorage(calls);
        }
    });

    test("hides sellers rejected by existence, status, or required verification", async () => {
        const sellers: Array<OfferImageFixtureOptions["seller"]> = [
            null,
            { ...verifiedOwnerRow, verification_status: "rejected" },
            { ...verifiedOwnerRow, verification_status: "suspended" },
            { ...verifiedOwnerRow, verification_status: "pending" },
        ];

        for (const seller of sellers) {
            useOfferImageResponder({ seller });
            const before = fetchCount();
            const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`);
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 404,
                body: { error: "offer not found" },
            });
            expectNoStorage(calls);
        }
    });

    test("allows a pending seller only when verification is optional", async () => {
        useOfferImageResponder({
            settings: { require_verified_seller: false },
            seller: { ...verifiedOwnerRow, verification_status: "pending" },
        });

        const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`);
        const calls = callsSince(0);

        expect(response.status).toBe(200);
        expect(calls.filter((call) => call.url.includes("/storage/v1/object/"))).toHaveLength(1);
    });

    test("returns a settings 502 after offer visibility and before media download", async () => {
        useOfferImageResponder({ settings: null });

        const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`);
        const calls = callsSince(0);

        expect({ status: response.status, body: await response.json() }).toEqual({
            status: 502,
            body: { error: "commerce settings are unavailable" },
        });
        expectNoStorage(calls);
    });

    test("preserves offer, settings, seller, and media failure priority", async () => {
        const scenarios = [
            {
                options: {
                    offer: { ...activeOfferRow, publication_status: "draft" },
                    settings: null,
                },
                expected: { status: 404, body: { error: "offer image not found" } },
            },
            {
                options: { settings: null, seller: null, media: null },
                expected: { status: 502, body: { error: "commerce settings are unavailable" } },
            },
            {
                options: {
                    seller: { ...verifiedOwnerRow, verification_status: "suspended" },
                    media: null,
                },
                expected: { status: 404, body: { error: "offer not found" } },
            },
        ];

        for (const scenario of scenarios) {
            useOfferImageResponder(scenario.options);
            const before = fetchCount();
            const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`);
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual(scenario.expected);
            expectNoStorage(calls);
        }
    });
});

describe("commerce self offer image ownership", () => {
    test("anti-enumerates every missing ownership link and another seller before Storage", async () => {
        const scenarios: OfferImageFixtureOptions[] = [
            { offerMedia: null },
            { offer: null },
            { seller: null },
            { seller: { ...verifiedOwnerRow, cms_user_id: "another-user" } },
        ];

        for (const options of scenarios) {
            useOfferImageResponder(options);
            const before = fetchCount();
            const response = await requestCommerce(`/me/offer/image?id=${offerImageMediaId}`, {
                userId: "seller-user-123",
            });
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 404,
                body: { error: "offer image not found" },
            });
            expectNoStorage(calls);
        }
    });

    test("keeps owner access independent from public offer and seller eligibility", async () => {
        useOfferImageResponder({
            offer: { ...activeOfferRow, publication_status: "draft" },
            settings: null,
            seller: { ...verifiedOwnerRow, verification_status: "suspended" },
        });

        const response = await requestCommerce(`/me/offer/image?id=${offerImageMediaId}`, {
            userId: "seller-user-123",
        });
        const calls = callsSince(0);

        expect(response.status).toBe(200);
        expect(calls.filter((call) => call.url.includes("/storage/v1/object/"))).toHaveLength(1);
    });
});
