import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useC2cPolicyResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce optimized protected C2C policy read budgets", () => {
    test("loads the complete protected configuration in one database call", async () => {
        useC2cPolicyResponder();

        const response = await requestCommerce("/admin/c2c-policies");
        const readModel = expectSingleRpc("get_c2c_policy_configuration_read_model");

        expect(response.status).toBe(200);
        expect(readModel.body).toEqual({});
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
