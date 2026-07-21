import { describe, expect, test } from "bun:test";
import { createTrackedProviderTransferFixture, type CreateProviderReconciliationHarness } from "../harness";

export function registerProviderTransferContextFailureContracts(
    createHarness: CreateProviderReconciliationHarness,
): void {
    describe("stripe-connect provider transfer reconciliation failure contracts", () => {
        test("stops before local context reads when the provider list fails", async () => {
            const fixture = await createTrackedProviderTransferFixture(createHarness, "provider-transfer-list-failure");
            fixture.rest.failNextProviderTransferList();

            const failed = await fixture.submit("system-transfer-context", "reconcileProviderPayment", {
                paymentId: fixture.paymentId,
            });

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({ error: "simulated Stripe Transfer list outage" });
            expect(fixture.rest.postgrestRequests.map((request) => request.table)).toEqual([
                "payments",
                "rpc/apply_payment_provider_projection",
            ]);
        });

        test("preserves the local read failure and skips all later ledger writes", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "provider-transfer-context-failure",
            );
            fixture.rest.failProviderTransferContextReadAfter(0);

            const failed = await fixture.submit("system-transfer-context", "reconcileProviderPayment", {
                paymentId: fixture.paymentId,
            });

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({
                error: "simulated provider transfer context read failure",
            });
            expect(fixture.rest.postgrestRequests.map((request) => [request.method, request.table])).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/read_provider_transfer_reconciliation_context"],
            ]);
            expect(fixture.rest.rows("transfers")[0]).toMatchObject({
                status: "succeeded",
                stripe_transfer_id: fixture.stripeTransferIds[0],
            });
        });

        test("keeps earlier transfer progress when a later local read fails", async () => {
            const fixture = await createTrackedProviderTransferFixture(
                createHarness,
                "provider-transfer-partial-progress",
                [
                    { id: "initial", amount: 500 },
                    { id: "reserve", amount: 580 },
                ],
            );
            const [firstId, secondId] = fixture.stripeTransferIds;
            fixture.rest.patchProviderTransfer(firstId!, { reconciliation_marker: "first" });
            fixture.rest.patchProviderTransfer(secondId!, { reconciliation_marker: "second" });
            fixture.rest.failProviderTransferContextReadAfter(1);

            const failed = await fixture.submit("system-transfer-context", "reconcileProviderPayment", {
                paymentId: fixture.paymentId,
            });

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({
                error: "simulated provider transfer context read failure",
            });
            const transfers = fixture.rest.rows("transfers");
            expect(transfers[0]?.provider_snapshot).toMatchObject({ reconciliation_marker: "first" });
            expect(transfers[1]?.provider_snapshot).not.toMatchObject({ reconciliation_marker: "second" });
            expect(fixture.rest.postgrestRequests.slice(2).map((request) => [request.method, request.table])).toEqual([
                ["POST", "rpc/read_provider_transfer_reconciliation_context"],
                ["PATCH", "transfers"],
                ["POST", "rpc/read_provider_transfer_reconciliation_context"],
            ]);
        });
    });
}
