import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../../../tests/helpers/integrationDefinition";
import { loadSupabaseSchemaSql } from "../../../../../../../../tests/helpers/supabaseSql";
import { integrationRoot } from "../paths";

export function registerPayoutControlsTest(): void {
    test("publishes aggregate payout controls as required payment and release inputs", async () => {
        const definition = await loadIntegrationDefinition<any>(resolve(integrationRoot, "definition.json"));
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source");
        const endpoint = source.source.endpoints.find(
            (candidate: any) => candidate.endpointId === "prepareProtectedPayment",
        );
        const body = endpoint.output[0].body;

        expect(endpoint.access).toBe("system");
        expect(body.required).toEqual(
            expect.arrayContaining([
                "payoutDelayDays",
                "sellerReserveLiabilityDays",
                "sellerRequiredMinimumBalanceAmount",
                "platformRequiredMinimumBalanceAmount",
                "platformLiabilityRevision",
                "platformPayoutChangeDirection",
            ]),
        );
        expect(body.properties).toMatchObject({
            payoutDelayDays: { type: "number" },
            sellerReserveLiabilityDays: { type: "number" },
            sellerRequiredMinimumBalanceAmount: { type: "number" },
            platformRequiredMinimumBalanceAmount: { type: "number" },
            platformLiabilityRevision: { type: "number" },
            platformPayoutChangeDirection: { type: "string" },
        });
        const releaseBody = source.source.endpoints.find(
            (candidate: any) => candidate.endpointId === "authorizeOrderRelease",
        ).output[0].body;
        const dueReleaseItem = source.source.endpoints.find(
            (candidate: any) => candidate.endpointId === "authorizeDueOrderReleases",
        ).output[0].body.properties.authorizations.items;
        for (const releaseShape of [releaseBody, dueReleaseItem]) {
            expect(releaseShape.required).toEqual(
                expect.arrayContaining(["sellerId", "sellerRequiredMinimumBalanceAmount", "payoutDelayDays"]),
            );
            expect(releaseShape.properties).toMatchObject({
                sellerId: {
                    type: "string",
                    semantic: { kind: "user-id", authority: "cms" },
                },
                sellerRequiredMinimumBalanceAmount: { type: "number" },
                payoutDelayDays: { type: "number" },
            });
        }
        const schema = await loadSupabaseSchemaSql(integrationRoot);
        expect(schema).toContain("authorize_platform_payout_liability_decrease");
        expect(schema).toContain("conflict: stale platform payout liability revision");
        expect(schema).toContain("provider applied amount is below the Commerce aggregate");
        expect(schema).toContain("Admin-authorized provider decrease must match the exact Commerce aggregate");
        expect(schema).toContain("liability.risk_release_at > now()");
        expect(schema).toContain("status not in ('won', 'prevented', 'warning_closed')");
    });
}
