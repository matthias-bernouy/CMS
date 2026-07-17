import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useC2cPolicyResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce current protected C2C policy read budgets", () => {
    test("records six database calls and the exact historical orders", async () => {
        useC2cPolicyResponder();

        const response = await requestCommerce("/admin/c2c-policies");
        const calls = capturedFetches();
        const resources = calls.map(call => new URL(call.url).pathname.split("/").at(-1));

        expect(response.status).toBe(200);
        expect(calls).toHaveLength(6);
        expect(resources).toEqual([
            "settings", "fee_policies", "protection_policies", "seller_risk_policies",
            "fee_policy_components", "financial_subsidy_overrides",
        ]);
        expect(new URL(calls[4]!.url).searchParams.get("order")).toBe("position.asc,id.asc");
        expect(new URL(calls[5]!.url).searchParams.get("order")).toBe("created_at.desc");
        expect(calls.every(call => new URL(call.url).pathname.startsWith("/rest/v1/"))).toBe(true);
    });

    test("records one database call for missing settings", async () => {
        useC2cPolicyResponder({ settings: null });

        const response = await requestCommerce("/admin/c2c-policies");

        expect(response.status).toBe(500);
        expect(capturedFetches()).toHaveLength(1);
    });

    test("performs no database, Storage, or provider call for a local refusal", async () => {
        const response = await requestCommerce("/admin/c2c-policies", { userRole: "user" });

        expect(response.status).toBe(403);
        expect(capturedFetches()).toHaveLength(0);
    });
});
