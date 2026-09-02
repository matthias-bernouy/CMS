import { describe, expect, test } from "bun:test";
import type { DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../tests/helpers/integrationDefinition";

type Endpoint = {
    endpointId: string;
    method?: string;
    access?: string;
    params?: Array<{
        name: string;
        in: string;
        type: string;
        required?: boolean;
    }>;
    headers?: Array<{ name: string }>;
    output?: Array<{ body?: DataShape }>;
};

const definitionPath = resolve(import.meta.dir, "../../../definition.json");

describe("commerce delivery context Source contracts", () => {
    test("declares exact actor-scoped system endpoints", async () => {
        const endpoints = await commerceEndpoints();
        const setup = endpoints.find((candidate) => candidate.endpointId === "getOrderDeliverySetupContext");
        const selection = endpoints.find((candidate) => candidate.endpointId === "getOrderDeliverySelectionContext");
        const setupBody = setup?.output?.[0]?.body;
        const setupOrder = setupBody?.properties?.order;
        const authorization = setupBody?.properties?.authorization;
        const selectionBody = selection?.output?.[0]?.body;

        for (const endpoint of [setup, selection]) {
            expect(endpoint).toMatchObject({
                method: "GET",
                access: "system",
                params: [
                    {
                        name: "orderId",
                        in: "query",
                        type: "string",
                    },
                ],
            });
            expect(endpoint?.params?.[0]).not.toHaveProperty("required");
            expect(endpoint?.headers?.map((header) => header.name)).toEqual(["authorization", "x-cms-user-id"]);
        }
        expect(Object.keys(setupBody?.properties ?? {})).toEqual(["order", "authorization"]);
        expect(setupBody?.required).toEqual(["order", "authorization"]);
        expect(Object.keys(setupOrder?.properties ?? {})).toEqual(["publicId", "buyerCmsUserId", "status", "version"]);
        expect(setupOrder?.required).toEqual(["publicId", "buyerCmsUserId", "status", "version"]);
        expect(Object.keys(authorization?.properties ?? {})).toEqual([
            "buyerCmsUserId",
            "status",
            "orderVersion",
            "sellerCmsUserId",
            "currency",
            "merchandiseSubtotalMinorAmount",
            "shippingAddress",
        ]);
        expect(authorization).toMatchObject({
            nullable: true,
            required: [
                "buyerCmsUserId",
                "status",
                "orderVersion",
                "sellerCmsUserId",
                "currency",
                "merchandiseSubtotalMinorAmount",
                "shippingAddress",
            ],
        });
        expect(Object.keys(selectionBody?.properties ?? {})).toEqual(["publicId", "buyerCmsUserId", "deliveryQuoteId"]);
        expect(selectionBody?.required).toEqual(["publicId", "buyerCmsUserId", "deliveryQuoteId"]);
        expect(selectionBody?.properties?.deliveryQuoteId?.nullable).toBe(true);
        for (const shape of [
            setupOrder?.properties?.buyerCmsUserId,
            authorization?.properties?.buyerCmsUserId,
            authorization?.properties?.sellerCmsUserId,
            selectionBody?.properties?.buyerCmsUserId,
        ]) {
            expect(shape?.semantic?.authority).toBe("cms");
        }
    });
});

async function commerceEndpoints(): Promise<Endpoint[]> {
    const definition = await loadIntegrationDefinition<{
        artifacts: Array<{ source?: { endpoints: Endpoint[] } }>;
    }>(definitionPath);
    return definition.artifacts.find((artifact) => artifact.source)?.source?.endpoints ?? [];
}
