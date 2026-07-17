import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { useClaimDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce current administrator claim detail budgets", () => {
    test("records four database calls for a complete claim bundle", async () => {
        useClaimDetailResponder();

        const response = await requestCommerce("/admin/claim?id=7");
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls).toHaveLength(4);
        expect(calls.every(call => new URL(call.url).pathname.startsWith("/rest/v1/"))).toBe(true);
        expect(calls.map(call => new URL(call.url).searchParams.get("order"))).toEqual([
            null,
            "created_at.asc,id.asc",
            "created_at.asc,id.asc",
            "occurred_at.asc,id.asc",
        ]);
    });

    test("records one database call for a missing claim", async () => {
        useClaimDetailResponder({ claim: null });

        const response = await requestCommerce("/admin/claim?id=7");

        expect(response.status).toBe(404);
        expect(capturedFetches()).toHaveLength(1);
    });

    test("performs no database, Storage, or provider call for a local refusal", async () => {
        const response = await requestCommerce("/admin/claim?id=7", { userRole: "user" });

        expect(response.status).toBe(403);
        expect(capturedFetches()).toHaveLength(0);
    });
});
