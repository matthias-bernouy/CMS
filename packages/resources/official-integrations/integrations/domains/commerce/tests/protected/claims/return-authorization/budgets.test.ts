import { describe, expect, test } from "bun:test";
import { capturedFetches, expectSingleRpc, installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { useReturnAuthorizationResponder } from "./fixtures";
import { claimId, claimRow } from "./raw";

installCommerceTestEnvironment();

const route = `/system/claim/return-authorization?claimId=${claimId}`;

describe("commerce optimized claim return authorization call budgets", () => {
    test("loads the complete bounded context in one database call", async () => {
        useReturnAuthorizationResponder();

        const response = await requestCommerce(route);
        const call = expectSingleRpc("get_claim_return_authorization_context");

        expect(response.status).toBe(200);
        expect(call.body).toEqual({ p_claim_id: claimId });
    });

    test("keeps one database call for a missing claim", async () => {
        useReturnAuthorizationResponder({ claim: null });

        const response = await requestCommerce(route);
        const call = expectSingleRpc("get_claim_return_authorization_context");

        expect(response.status).toBe(404);
        expect(call.body).toEqual({ p_claim_id: claimId });
    });

    test("uses one bounded context for participant and state results", async () => {
        useReturnAuthorizationResponder({ seller: null });
        const incomplete = await requestCommerce(route);
        expect(incomplete.status).toBe(409);
        expect(capturedFetches()).toHaveLength(1);

        useReturnAuthorizationResponder({
            claim: { ...claimRow, status: "under_review" },
        });
        const before = capturedFetches().length;
        const denied = await requestCommerce(route);
        expect(denied.status).toBe(200);
        expect(await denied.json()).toMatchObject({
            allowed: false,
            reason: "claim_not_awaiting_return",
        });
        expect(capturedFetches().slice(before)).toHaveLength(1);
    });

    test("performs no database, Storage, or provider call for a local refusal", async () => {
        const response = await requestCommerce("/system/claim/return-authorization?claimId=invalid");

        expect(response.status).toBe(400);
        expect(capturedFetches()).toHaveLength(0);
    });
});
