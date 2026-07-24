import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce public offer read model failures", () => {
    test("keeps a missing offer hidden even when settings are unavailable", async () => {
        setRestResponder(() =>
            jsonResponse({
                candidate_exists: false,
                settings_available: false,
                offer: null,
            }),
        );

        const response = await requestCommerce("/offer?id=404");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer not found" });
        expect(expectSingleRpc("get_public_offer_read_model").body).toEqual({ p_offer_id: 404 });
    });

    test("preserves the settings failure after finding an active offer", async () => {
        setRestResponder(() =>
            jsonResponse({
                candidate_exists: true,
                settings_available: false,
                offer: null,
            }),
        );

        const response = await requestCommerce("/offer?id=91");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "commerce settings are unavailable" });
        expect(expectSingleRpc("get_public_offer_read_model").body).toEqual({ p_offer_id: 91 });
    });

    test("preserves the settings failure before returning a public list", async () => {
        setRestResponder(() =>
            jsonResponse({
                settings_available: false,
                items: [],
                total: 0,
            }),
        );

        const response = await requestCommerce("/offers");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "commerce settings are unavailable" });
        expect(expectSingleRpc("list_public_offers_read_model").body).toEqual({
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("fails closed when the public price precision policy is missing", async () => {
        setRestResponder(() =>
            jsonResponse({
                settings_available: true,
                items: [],
                total: 0,
            }),
        );

        const response = await requestCommerce("/offers");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "list_public_offers_read_model returned an invalid response",
        });
    });
});
