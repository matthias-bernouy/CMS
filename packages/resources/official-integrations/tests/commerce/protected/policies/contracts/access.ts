import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../helpers/integrationDefinition";
import { integrationRoot } from "./paths";

export function registerAdminHeadersTest(): void {
    test("declares computed actor and role headers on every financial admin endpoint", async () => {
        const definition = await loadIntegrationDefinition<any>(resolve(integrationRoot, "definition.json"));
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source");
        const financialIds = new Set([
            "c2cPolicies",
            "createC2cPolicyRevision",
            "protectedPayments",
            "protectedPayment",
            "claims",
            "claim",
            "resolveOrderClaim",
            "refundRequests",
            "refundRequest",
            "requestOrderRefund",
            "reviewOrderRefund",
            "authorizeOrderRelease",
            "reviewOrderCancellation",
            "listCommerceExceptions",
        ]);
        const financialEndpoints = source.source.endpoints.filter((item: any) => financialIds.has(item.endpointId));
        expect(financialEndpoints).toHaveLength(financialIds.size);
        for (const endpoint of financialEndpoints) {
            expect(endpoint.access).toEqual({ mode: "admin" });
            expect(endpoint.headers).toEqual(
                expect.arrayContaining([
                    { name: "x-cms-user-id", source: { from: "computed", ref: "userID" } },
                    { name: "x-cms-user-role", source: { from: "computed", ref: "userRole" } },
                ]),
            );
        }
    });
}
