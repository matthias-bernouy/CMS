import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { expectedC2cPolicyResponse, expectedC2cSourceResponse } from "./expected";
import { useC2cPolicyResponder } from "./fixtures";
import { feePolicyRow } from "./raw";

installCommerceTestEnvironment();

describe("commerce protected C2C policy strict Source contract", () => {
    test("preserves the exact published-policy projection consumed by the dashboard", async () => {
        const publishedFee = {
            ...feePolicyRow,
            status: "published",
            published_at: "2026-07-17T09:05:00.000Z",
        };
        useC2cPolicyResponder({ feePolicy: publishedFee });
        const response = await requestCommerce("/admin/c2c-policies");
        const raw = await response.json();

        expect(response.status).toBe(200);
        expect(projectStrictDataShape(raw, await sourceShape(), "response", {
            enforceRequired: false,
        })).toEqual(expectedC2cSourceResponse(expectedC2cPolicyResponse({
            feePolicy: publishedFee,
        })));
    });

    test("records the current draft publishedAt null mismatch separately from performance", async () => {
        useC2cPolicyResponder();
        const raw = await (await requestCommerce("/admin/c2c-policies")).json();
        const shape = await sourceShape();

        expect(() => projectStrictDataShape(raw, shape, "response", {
            enforceRequired: false,
        })).toThrow();
    });
});

const definitionPath = resolve(
    import.meta.dir,
    "../../../../../integrations/commerce/versions/1.0.0/definition.json",
);

async function sourceShape(): Promise<DataShape> {
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    const endpoint = definition.artifacts
        .find((artifact: any) => artifact.source)?.source?.endpoints
        .find((candidate: any) => candidate.endpointId === "c2cPolicies");
    const shape = endpoint?.output?.find((output: any) => output.status === "200")?.body;
    if (!shape) throw new Error("Missing c2cPolicies 200 output shape");
    return shape;
}
