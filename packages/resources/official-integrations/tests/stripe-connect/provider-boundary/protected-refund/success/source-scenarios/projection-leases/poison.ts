import { expect } from "bun:test";
import type { StripeConnectHarness } from "../../../../../runtime/harness";
import { okJson } from "../../../../../runtime/http";
import { sourceJson, sourceJsonWithRole } from "../../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../../runtime/types";

export async function verifyPoisonProjectionRecovery(harness: StripeConnectHarness, paymentId: number): Promise<void> {
    harness.rest.seedPaymentProjection(paymentId, "test:payment:poison");
    harness.rest.seedPaymentProjection(paymentId, "test:payment:healthy");
    const poisonBatch = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-poison-1",
            limit: 2,
        }),
    );
    const [poison, healthy] = poisonBatch.payments as JsonRecord[];
    await okJson(
        await sourceJson(harness, "failCommerceProjection", {
            projectionId: poison!.projectionId,
            claimToken: poison!.projectionClaimToken,
            error: "synthetic Commerce poison projection",
        }),
    );
    await okJson(
        await sourceJson(harness, "acknowledgeCommerceProjection", {
            projectionId: healthy!.projectionId,
            claimToken: healthy!.projectionClaimToken,
        }),
    );
    harness.rest.seedPaymentProjection(paymentId, "test:payment:after-poison");
    const afterPoison = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-poison-2",
            limit: 1,
        }),
    );
    expect(afterPoison.payments).toHaveLength(1);
    expect((afterPoison.payments as JsonRecord[])[0]?.providerEventId).toBe("test:payment:after-poison");
    const afterPoisonLease = (afterPoison.payments as JsonRecord[])[0]!;
    await okJson(
        await sourceJson(harness, "acknowledgeCommerceProjection", {
            projectionId: afterPoisonLease.projectionId,
            claimToken: afterPoisonLease.projectionClaimToken,
        }),
    );

    for (let attempt = 2; attempt <= 5; attempt++) {
        harness.rest.makeProjectionRetryDue(Number(poison!.projectionId));
        const retry = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: `projection-poison-retry-${attempt}`,
                limit: 1,
            }),
        );
        const retryLease = (retry.payments as JsonRecord[])[0]!;
        expect(retryLease.projectionId).toBe(poison!.projectionId);
        await okJson(
            await sourceJson(harness, "failCommerceProjection", {
                projectionId: retryLease.projectionId,
                claimToken: retryLease.projectionClaimToken,
                error: "synthetic Commerce poison projection",
            }),
        );
    }
    expect(harness.rest.rows("commerce_projection_outbox")).toContainEqual(
        expect.objectContaining({
            id: poison!.projectionId,
            projection_status: "manual_review",
            attempt_count: 5,
            intervention_revision: 0,
            last_error: "synthetic Commerce poison projection",
        }),
    );
    expect(harness.rest.rows("provider_exceptions")).toContainEqual(
        expect.objectContaining({
            deduplication_key: `commerce-projection:${poison!.projectionId}`,
            exception_type: "commerce_projection_delivery_failed",
            severity: "critical",
            status: "open",
        }),
    );

    const forbidden = await sourceJsonWithRole(harness, "support-1", "support", "requeueCommerceProjection", {
        projectionId: poison!.projectionId,
        expectedInterventionRevision: 0,
        reason: "Commerce consumer was repaired",
    });
    expect(forbidden.status).toBe(403);
    const requeued = await okJson(
        await sourceJson(harness, "requeueCommerceProjection", {
            projectionId: poison!.projectionId,
            expectedInterventionRevision: 0,
            reason: "Commerce consumer was repaired",
        }),
    );
    expect(requeued).toMatchObject({
        projectionId: poison!.projectionId,
        projectionStatus: "retry",
        interventionRevision: 1,
    });
    const staleReplay = await sourceJson(harness, "requeueCommerceProjection", {
        projectionId: poison!.projectionId,
        expectedInterventionRevision: 0,
        reason: "stale duplicate intervention",
    });
    expect(staleReplay.status).toBe(409);
    expect(harness.rest.rows("commerce_projection_interventions")).toContainEqual(
        expect.objectContaining({
            projection_id: poison!.projectionId,
            intervention_revision: 1,
            actor_id: "user-123",
            reason: "Commerce consumer was repaired",
        }),
    );

    const interventionRun = await okJson(
        await sourceJson(harness, "runProviderReconciliation", {
            runKey: "projection-poison-finance-requeue",
            limit: 1,
        }),
    );
    const interventionLease = (interventionRun.payments as JsonRecord[])[0]!;
    expect(interventionLease.projectionId).toBe(poison!.projectionId);
    await okJson(
        await sourceJson(harness, "acknowledgeCommerceProjection", {
            projectionId: interventionLease.projectionId,
            claimToken: interventionLease.projectionClaimToken,
        }),
    );
    expect(harness.rest.rows("provider_exceptions")).toContainEqual(
        expect.objectContaining({
            deduplication_key: `commerce-projection:${poison!.projectionId}`,
            status: "resolved",
            resolved_by: "commerce-projection-ack",
        }),
    );
    expect(
        harness.rest.rows("commerce_projection_outbox").filter((row) => row.projection_key === "test:payment:poison"),
    ).toHaveLength(1);
}
