import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";

const databaseContext = {
    offer_id: 42,
    offer_slug: "smoke-racket",
    offer_title: "Smoke racket",
    seller_cms_user_id: "seller-user",
    seller_display_name: "Seller",
    reference_amount: 10_000,
    currency: "eur",
    publication_status: "active",
    availability: "available",
};
const expectedContext = {
    offerId: 42,
    offerSlug: "smoke-racket",
    offerTitle: "Smoke racket",
    sellerCmsUserId: "seller-user",
    sellerDisplayName: "Seller",
    referenceAmount: 10_000,
    currency: "eur",
    publicationStatus: "active",
    availability: "available",
};
installCommerceTestEnvironment();
describe("commerce offer negotiation context", () => {
    test("returns only the bounded context through one service-role RPC", async () => {
        setRestResponder(() =>
            jsonResponse({
                state: "ok",
                context: {
                    ...databaseContext,
                    seller_id: 17,
                    metadata: { private: true },
                },
                private_state: "must-not-leak",
            }),
        );

        const response = await requestCommerce("/system/offer/negotiation-context?offerId=42");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedContext);
        expect(expectSingleRpc("get_offer_negotiation_context").body).toEqual({
            p_offer_id: 42,
        });
    });
    test("preserves explicit nullable identities and reference amounts", async () => {
        setRestResponder(() =>
            jsonResponse({
                state: "ok",
                context: {
                    ...databaseContext,
                    seller_cms_user_id: null,
                    reference_amount: null,
                },
            }),
        );

        const response = await requestCommerce("/system/offer/negotiation-context?offerId=42");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ...expectedContext,
            sellerCmsUserId: null,
            referenceAmount: null,
        });
    });
    for (const [state, error] of [
        ["not_found", "offer not found"],
        ["seller_not_found", "seller not found"],
    ] as const) {
        test(`maps ${state} without exposing database details`, async () => {
            setRestResponder(() =>
                jsonResponse({
                    state,
                    context: { internal: "must-not-leak" },
                }),
            );

            const response = await requestCommerce("/system/offer/negotiation-context?offerId=42");

            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error });
            expectSingleRpc("get_offer_negotiation_context");
        });
    }
    test("rejects authentication, method, and selector errors before database work", async () => {
        const unauthenticated = await requestCommerce("/system/offer/negotiation-context?offerId=42", {
            authenticated: false,
        });
        const wrongMethod = await requestCommerce("/system/offer/negotiation-context?offerId=42", { method: "POST" });
        const missing = await requestCommerce("/system/offer/negotiation-context");
        const unsafe = await requestCommerce("/system/offer/negotiation-context?offerId=9007199254740992");

        expect({
            unauthenticated: [unauthenticated.status, await unauthenticated.json()],
            wrongMethod: [wrongMethod.status, await wrongMethod.text(), wrongMethod.headers.get("allow")],
            missing: [missing.status, await missing.json()],
            unsafe: [unsafe.status, await unsafe.json()],
        }).toEqual({
            unauthenticated: [401, { error: "invalid CMS API key" }],
            wrongMethod: [405, "Method Not Allowed", "GET, OPTIONS"],
            missing: [400, { error: "offerId is required" }],
            unsafe: [400, { error: "offerId must be an integer" }],
        });
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves every safe integer selector at the database boundary", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const ids = [0, -1, Number.MAX_SAFE_INTEGER];
        const statuses = [];
        for (const id of ids) {
            statuses.push((await requestCommerce(`/system/offer/negotiation-context?offerId=${id}`)).status);
        }

        expect(statuses).toEqual([404, 404, 404]);
        expect(capturedFetches().map((call) => call.body)).toEqual(ids.map((p_offer_id) => ({ p_offer_id })));
    });

    for (const [label, malformed] of [
        ["the context is missing", { state: "ok" }],
        [
            "a required field is missing",
            {
                state: "ok",
                context: { ...databaseContext, availability: undefined },
            },
        ],
        [
            "an identifier has the wrong type",
            {
                state: "ok",
                context: { ...databaseContext, offer_id: "42" },
            },
        ],
        [
            "an amount is not an integer",
            {
                state: "ok",
                context: { ...databaseContext, reference_amount: 1.5 },
            },
        ],
        ["the state is unknown", { state: "unexpected", context: databaseContext }],
    ] as const) {
        test(`fails closed when ${label}`, async () => {
            setRestResponder(() => jsonResponse(malformed));

            const response = await requestCommerce("/system/offer/negotiation-context?offerId=42");

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "get_offer_negotiation_context returned an invalid response",
            });
        });
    }
});
