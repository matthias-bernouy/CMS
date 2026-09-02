import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";

installCommerceTestEnvironment();

const error = "list_seller_offers_read_model returned an invalid response";

describe("commerce seller offer read-model failures", () => {
    test("fails closed when the RPC envelope is malformed", async () => {
        setRestResponder(() => jsonResponse({ seller_exists: "yes", status_valid: true }));

        const response = await requestCommerce("/me/offers", { userId: "seller-user-123" });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error });
        expect(expectSingleRpc("list_seller_offers_read_model").body).toEqual({
            p_cms_user_id: "seller-user-123",
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("rejects non-numeric totals even when every array is present", async () => {
        setRestResponder(() =>
            jsonResponse({
                seller_exists: true,
                status_valid: true,
                rows: [],
                workflow_states: [],
                media: [],
                active_price_proposals: [],
                total: null,
            }),
        );

        const response = await requestCommerce("/me/offers", { userId: "seller-user-123" });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error });
        expectSingleRpc("list_seller_offers_read_model");
    });
});
