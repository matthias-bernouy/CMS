import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useClaimDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce optimized administrator claim detail budgets", () => {
    test("loads a complete claim bundle in one database call", async () => {
        useClaimDetailResponder();

        const response = await requestCommerce("/admin/claim?id=7");

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_marketplace_claim_read_model").body).toEqual({
            p_claim_id: 7,
        });
    });

    test("keeps one database call for a missing claim", async () => {
        useClaimDetailResponder({ claim: null });

        const response = await requestCommerce("/admin/claim?id=7");

        expect(response.status).toBe(404);
        expect(expectSingleRpc("get_marketplace_claim_read_model").body).toEqual({
            p_claim_id: 7,
        });
    });

    test("performs no database, Storage, or provider call for a local refusal", async () => {
        const response = await requestCommerce("/admin/claim?id=7", { userRole: "user" });

        expect(response.status).toBe(403);
        expect(capturedFetches()).toHaveLength(0);
    });
});
