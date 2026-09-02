import { describe, expect, test } from "bun:test";
import {
    type CreateProviderBoundaryHarness,
    type JsonRecord,
    type ProviderBoundaryHarness,
    responseBody,
} from "../../harness";

const routeUrl = "https://project.supabase.co/functions/v1/cms-stripe-connect/admin/platform/payout-protection";
const validCommand = {
    platformPayoutControlChangeId: "platform-validation",
    minimumBalanceEur: 250,
    liabilityRevision: 1,
};

export function registerPlatformPayoutProtectionValidationContracts(
    createHarness: CreateProviderBoundaryHarness,
): void {
    describe("stripe-connect platform payout protection validation contracts", () => {
        test("authenticates before parsing or contacting Supabase and Stripe", async () => {
            const harness = await createHarness();

            const response = await directSubmit(harness, validCommand, false);

            expect(response.status).toBe(401);
            expect(await responseBody(response)).toEqual({ error: "invalid CMS API key" });
            expect(harness.rest.externalRequestOrder).toEqual([]);
        });

        test("keeps exact request validation errors ahead of Supabase and Stripe", async () => {
            const cases: Array<[JsonRecord, string]> = [
                [{ ...validCommand, unexpected: true }, "unexpected is not allowed"],
                [{}, "platformPayoutControlChangeId is required"],
                [{ ...validCommand, minimumBalanceEur: -1 }, "minimumBalanceEur must be non-negative"],
                [{ ...validCommand, liabilityRevision: -1 }, "liabilityRevision must be a non-negative safe integer"],
                [
                    { ...validCommand, decreaseAuthorizationId: "finance-approval" },
                    "decreaseAuthorizationId must be a UUID",
                ],
                [{ ...validCommand, delayDaysOverride: 32 }, "delayDaysOverride must be between zero and 31"],
            ];

            for (const [body, error] of cases) {
                const harness = await createHarness();

                const response = await directSubmit(harness, body);

                expect(response.status).toBe(400);
                expect(await responseBody(response)).toEqual({ error });
                expect(harness.rest.externalRequestOrder).toEqual([]);
            }
        });
    });
}

export async function directSubmit(
    harness: ProviderBoundaryHarness,
    body: JsonRecord,
    authenticated = true,
): Promise<Response> {
    const headers = new Headers({ "content-type": "application/json" });
    if (authenticated) {
        headers.set("authorization", `Bearer ${harness.apiKey}`);
    }
    return await harness.edgeRequest(
        new Request(routeUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        }),
    );
}
