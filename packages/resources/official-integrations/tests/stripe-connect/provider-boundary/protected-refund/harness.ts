import { expect } from "bun:test";
import {
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    type JsonRecord,
    postgrestBudget,
    protectedPaymentBody,
    type ProtectedRefundSearchScenario,
    type ProviderBoundaryHarness,
    responseBody,
} from "../harness";

export type ProtectedRefundHarness = ProviderBoundaryHarness & {
    rest: ProviderBoundaryHarness["rest"] & {
        loseNextRefundCreationResponse(): void;
        setNextRefundSearchScenario(scenario: ProtectedRefundSearchScenario): void;
        succeedNextRefundOperation(): void;
    };
};

export type ProtectedRefundFixture = {
    harness: ProtectedRefundHarness;
    paymentId: number;
};

export async function refundablePaymentFixture(
    createHarness: CreateProviderBoundaryHarness,
): Promise<ProtectedRefundFixture> {
    const harness = (await createHarness()) as ProtectedRefundHarness;
    expect((await enrollSeller(harness)).status).toBe(200);
    const paymentId = await createRefundablePayment(harness, "provider-order-1");
    clearRequests(harness);
    return { harness, paymentId };
}

export async function createRefundablePayment(
    harness: ProtectedRefundHarness,
    clientReferenceId: string,
): Promise<number> {
    const createdResponse = await harness.submit(
        "buyer-1",
        "admin",
        "createProtectedPayment",
        protectedPaymentBody({ clientReferenceId }),
    );
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
    return paymentId;
}

export function protectedRefundBody(paymentId: number, patch: JsonRecord = {}): JsonRecord {
    return {
        paymentId,
        refundRequestId: "protected-refund-1",
        commerceRefundRequestId: 701,
        amount: 300,
        authorizedSellerAmount: 780,
        sellerEntitlementReductionAmount: 300,
        reason: "partial buyer remedy",
        ...patch,
    };
}

export async function requestProtectedRefund(
    fixture: ProtectedRefundFixture,
    patch: JsonRecord = {},
): Promise<Response> {
    return await fixture.harness.submit(
        "commerce-system",
        "admin",
        "requestProtectedRefund",
        protectedRefundBody(fixture.paymentId, patch),
    );
}

export function refundOperation(fixture: ProtectedRefundFixture): JsonRecord {
    const operation = fixture.harness.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "refund_create");
    expect(operation).toBeDefined();
    return operation!;
}

export function assertNoRefundMoneyMovement(fixture: ProtectedRefundFixture): void {
    expect(fixture.harness.rest.refundCreateRequests).toHaveLength(0);
    expect(fixture.harness.rest.rows("refunds")).toHaveLength(0);
    expect(fixture.harness.rest.moneyCallOrder).not.toContain("refund");
}

export function currentBudget(fixture: ProtectedRefundFixture): Array<{ method: string; table: string }> {
    return postgrestBudget(fixture.harness);
}
