import { expect } from "bun:test";
import {
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    type JsonRecord,
    protectedPaymentBody,
    type ProviderBoundaryHarness,
    responseBody,
} from "../harness";

export type TransferReversalScenario =
    | "operation-succeeded"
    | "metadata-match"
    | "manual-review-no-match"
    | "ambiguous"
    | "has-more";

export type TransferReversalHarness = ProviderBoundaryHarness & {
    rest: ProviderBoundaryHarness["rest"] & {
        readonly transferReversalRequests: Array<{
            transferId: string;
            parameters: Array<[string, string]>;
            idempotencyKey: string | null;
        }>;
        rejectTransferReversals(): void;
        setNextTransferReversalScenario(scenario: TransferReversalScenario): void;
    };
};

export type TransferReversalFixture = {
    harness: TransferReversalHarness;
    paymentId: number;
    transferId: string;
};

export const initialReversalBudget = [
    { method: "GET", table: "payments" },
    { method: "GET", table: "transfer_recovery_requests" },
    { method: "POST", table: "rpc/upsert_seller_recovery_exposure_and_refresh" },
    { method: "POST", table: "rpc/claim_seller_payout_hold" },
    { method: "POST", table: "rpc/reserve_account_financial_operation" },
    { method: "PATCH", table: "financial_operations" },
    { method: "PATCH", table: "financial_operations" },
    { method: "POST", table: "rpc/complete_seller_payout_hold" },
    { method: "POST", table: "rpc/reserve_transfer_recovery" },
];

export const replayReversalBudget = [...initialReversalBudget.slice(0, 4), initialReversalBudget.at(-1)!];

export async function releasedTransferFixture(
    createHarness: CreateProviderBoundaryHarness,
): Promise<TransferReversalFixture> {
    const harness = (await createHarness()) as TransferReversalHarness;
    expect((await enrollSeller(harness)).status).toBe(200);
    const createdResponse = await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
    expect(createdResponse.status).toBe(200);
    const created = await responseBody(createdResponse);
    const paymentId = Number(created.paymentId);
    harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
    expect(
        (
            await harness.request("buyer-1", "admin", "getProtectedPayment", {
                paymentId: String(paymentId),
            })
        ).status,
    ).toBe(200);
    const release = await harness.submit("finance-1", "admin", "requestSettlementRelease", {
        paymentId,
        releaseAuthorizationId: "release-for-direct-reversal",
        releaseKind: "initial",
        amount: 1080,
        currency: "eur",
    });
    expect(release.status).toBe(200);
    const transferId = String(harness.rest.rows("transfers")[0]?.stripe_transfer_id);
    expect(transferId).toBe("tr_1");
    clearRequests(harness);
    return { harness, paymentId, transferId };
}

export function reversalBody(paymentId: number, patch: JsonRecord = {}): JsonRecord {
    return {
        paymentId,
        reversalRequestId: "direct-reversal-1",
        amount: 1080,
        reason: "buyer remedy",
        ...patch,
    };
}

export async function requestReversal(fixture: TransferReversalFixture, patch: JsonRecord = {}): Promise<Response> {
    return await fixture.harness.submit(
        "finance-1",
        "admin",
        "requestTransferReversal",
        reversalBody(fixture.paymentId, patch),
    );
}
