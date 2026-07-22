import { expect, test } from "bun:test";
import {
    createTerminalPageFixture,
    successfulJson,
    type CreateProviderReconciliationHarness,
    type JsonRecord,
} from "../harness";

export function registerTerminalReplayContracts(createHarness: CreateProviderReconciliationHarness): void {
    test("keeps terminal replays dynamic while paging projection leases", async () => {
        const fixture = await createTerminalPageFixture(createHarness, "terminal-page-replay");

        const first = await successfulJson(await fixture.run(fixture.seed.runKey, 2));
        expect(first).toMatchObject({
            runId: fixture.seed.runId,
            runKey: fixture.seed.runKey,
            status: "succeeded",
        });
        expect((first.payments as JsonRecord[]).map((row) => row.providerEventId)).toEqual([
            fixture.seed.paymentProjectionKey,
        ]);
        expect((first.commerceOperations as JsonRecord[]).map((row) => row.providerEventId)).toEqual([
            fixture.seed.operationProjectionKey,
        ]);
        expect(first.disputes).toEqual([]);

        fixture.rest.clearPostgrestRequests();
        const second = await successfulJson(await fixture.run(fixture.seed.runKey, 2));
        expect(second).toMatchObject({
            runId: fixture.seed.runId,
            runKey: fixture.seed.runKey,
            status: "succeeded",
        });
        expect(second.payments).toEqual([]);
        expect(second.commerceOperations).toEqual([]);
        expect((second.disputes as JsonRecord[]).map((row) => row.providerEventId)).toEqual([
            fixture.seed.disputeProjectionKey,
        ]);

        fixture.rest.clearPostgrestRequests();
        const drained = await successfulJson(await fixture.run(fixture.seed.runKey, 2));
        expect(drained.payments).toEqual([]);
        expect(drained.commerceOperations).toEqual([]);
        expect(drained.disputes).toEqual([]);
        expect(fixture.rest.stripeRequests).toEqual([]);
    });

    test("keeps a missing dispute projection leased and fails closed", async () => {
        const fixture = await createTerminalPageFixture(createHarness, "terminal-missing-dispute");
        fixture.rest.removeTerminalReconciliationDispute(fixture.seed.disputeRowId);

        const response = await fixture.run(fixture.seed.runKey, 10);

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "internal error" });
        expect(fixture.rest.stripeRequests).toEqual([]);
    });
}
