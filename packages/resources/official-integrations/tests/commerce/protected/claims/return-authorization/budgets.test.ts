import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
    supabaseUrl,
} from "../../../harness";
import { useReturnAuthorizationResponder } from "./fixtures";
import { claimId, claimRow } from "./raw";

installCommerceTestEnvironment();

const route = `/system/claim/return-authorization?claimId=${claimId}`;

describe("commerce claim return authorization call budgets", () => {
    test("uses one claim read followed by three relation reads", async () => {
        useReturnAuthorizationResponder();

        const response = await requestCommerce(route);
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls).toHaveLength(4);
        expect(calls.map(call => new URL(call.url).pathname)).toEqual([
            "/rest/v1/marketplace_claims",
            "/rest/v1/orders",
            "/rest/v1/sellers",
            "/rest/v1/order_financial_terms",
        ]);
        expect(calls.every(call => call.method === "GET")).toBe(true);
        expect(calls.every(call => call.url.startsWith(`${supabaseUrl}/rest/v1/`)))
            .toBe(true);
        expect(calls.every(call => call.headers.get("apikey") === "sb_secret_test"))
            .toBe(true);
        expect(calls.every(call => call.headers.get("accept-profile") === "commerce"))
            .toBe(true);
    });

    test("keeps one database call for a missing claim", async () => {
        useReturnAuthorizationResponder({ claim: null });

        const response = await requestCommerce(route);
        const calls = capturedFetches();

        expect(response.status).toBe(404);
        expect(calls).toHaveLength(1);
        expect(new URL(calls[0]!.url).pathname).toBe("/rest/v1/marketplace_claims");
    });

    test("hydrates all relations before a participant or state result", async () => {
        useReturnAuthorizationResponder({ seller: null });
        const incomplete = await requestCommerce(route);
        expect(incomplete.status).toBe(409);
        expect(capturedFetches()).toHaveLength(4);

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
        expect(capturedFetches().slice(before)).toHaveLength(4);
    });

    test("performs no database, Storage, or provider call for a local refusal", async () => {
        const response = await requestCommerce(
            "/system/claim/return-authorization?claimId=invalid",
        );

        expect(response.status).toBe(400);
        expect(capturedFetches()).toHaveLength(0);
    });
});
