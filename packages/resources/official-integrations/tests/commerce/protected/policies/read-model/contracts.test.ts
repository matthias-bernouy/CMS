import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { expectedC2cPolicyResponse } from "./expected";
import { useC2cPolicyResponder } from "./fixtures";
import { feePolicyRow } from "./raw";

installCommerceTestEnvironment();

describe("commerce protected C2C policy read contracts", () => {
    test("preserves the complete duplicated policy response and collection order", async () => {
        useC2cPolicyResponder();

        const response = await requestCommerce("/admin/c2c-policies");
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expectedC2cPolicyResponse());
        expect(body.components.map((row: { id: number }) => row.id)).toEqual([1_001, 1_002]);
        expect(body.subsidyOverrides.map((row: { id: number }) => row.id)).toEqual([1_102, 1_101]);
        expect(body.activePolicy.fee).toEqual(body.feePolicy);
        expect(body.activePolicy.protection).toEqual(body.protectionPolicy);
        expect(body.activePolicy.sellerRisk).toEqual(body.sellerRiskPolicy);
        expect(body.activePolicy.subsidy).toEqual(body.subsidyOverrides[0]);
    });

    test("preserves nullable policy fields, empty subsidies, and explicit null subsidy", async () => {
        const feePolicy = {
            ...feePolicyRow,
            subsidy_override: false,
            subsidy_reason: null,
        };
        useC2cPolicyResponder({ feePolicy, subsidies: [] });

        const response = await requestCommerce("/admin/c2c-policies");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(
            expectedC2cPolicyResponse({
                feePolicy,
                subsidies: [],
            }),
        );
    });
});
