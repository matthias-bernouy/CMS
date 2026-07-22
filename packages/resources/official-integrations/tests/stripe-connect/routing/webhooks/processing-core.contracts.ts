import { describe, expect, test } from "bun:test";
import { type CreateRoutingHarness, responseBody } from "../harness";
import { runStripeProcessing, sendStripeEvent } from "./processing-harness";

export function registerStripeWebhookCoreProcessingContracts(createHarness: CreateRoutingHarness): void {
    describe("stripe-connect webhook core processing contracts", () => {
        test("preserves the exact API-version failure on the durable event", async () => {
            const harness = await createHarness();
            const ingested = await sendStripeEvent(harness, {
                id: "evt_processing_wrong_version",
                type: "test_helpers.test_clock.ready",
                api_version: "2025-01-27.acacia",
                data: { object: { id: "clock_wrong_version" } },
            });

            expect(ingested.status).toBe(202);
            const run = await runStripeProcessing(harness, "processing-wrong-version");

            expect(run).toMatchObject({ status: "manual_review", scannedCount: 1, exceptionCount: 1 });
            expect(harness.rest.rows("stripe_events")[0]).toMatchObject({
                processing_status: "failed",
                attempt_count: 1,
                processing_started_at: null,
                last_error: "Stripe webhook API version mismatch: 2025-01-27.acacia",
            });
        });

        test("refreshes a tracked account.updated event from current provider truth", async () => {
            const harness = await createHarness();
            const enrolled = await harness.submit("seller-1", "admin", "enrollConnectSeller", {
                accountToken: "accttok_test_identity_123",
                marketplaceTermsAccepted: true,
                marketplaceTermsVersion: "courtside-seller-2026-07",
                marketplaceTermsHash: "c".repeat(64),
            });
            expect(enrolled.status).toBe(200);
            harness.rest.setStripeAccountState("seller-1", {
                requirements: {
                    entries: [
                        {
                            awaiting_action_from: "user",
                            description: "identity.individual.documents.primary_verification",
                            errors: [],
                            minimum_deadline: { status: "currently_due" },
                        },
                    ],
                    summary: { minimum_deadline: { status: "currently_due" } },
                },
            });
            const account = harness.rest.rows("accounts")[0];
            const ingested = await sendStripeEvent(
                harness,
                {
                    id: "evt_account_updated_processing",
                    type: "account.updated",
                    account: account.stripe_account_id,
                    data: { object: { id: account.stripe_account_id } },
                },
                { route: "stripe-connect", secret: "whsec_connect_test_456" },
            );

            expect(ingested.status).toBe(202);
            const run = await runStripeProcessing(harness, "account-updated-processing");

            expect(run).toMatchObject({ status: "succeeded", repairedCount: 1, exceptionCount: 0 });
            expect(harness.rest.rows("accounts")[0]).toMatchObject({
                onboarding_status: "requirements_due",
                requirements_currently_due: ["identity.individual.documents.primary_verification"],
            });
            expect(harness.rest.rows("stripe_events")[0]).toMatchObject({ processing_status: "processed" });
            expect(await responseBody(ingested)).toEqual({ received: true, duplicate: false });
        });
    });
}
