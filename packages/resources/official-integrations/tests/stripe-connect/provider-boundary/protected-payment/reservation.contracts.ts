import { describe, expect, test } from "bun:test";
import {
    accountSyncRequest,
    balanceSettingsRequest,
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    financialTermsHash,
    paymentIntentRequest,
    postgrestBody,
    postgrestBudget,
    protectedPaymentBody,
    responseBody,
    type ProviderBoundaryHarness,
} from "../harness";
import { expectedProtectedPayment } from "./expectations";

const reservationBudget = [
    { method: "GET", table: "accounts" },
    { method: "GET", table: "accounts" },
    { method: "PATCH", table: "accounts" },
    { method: "GET", table: "payments" },
    { method: "GET", table: "platform_payout_controls" },
    { method: "POST", table: "rpc/reserve_protected_payment" },
];

export function registerProtectedPaymentReservationContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected payment reservation contracts", () => {
        test("uses the exact concurrent payment exposed after a failed reservation response", async () => {
            const harness = await preparedHarness(createHarness);
            harness.rest.failNextProtectedPaymentReservation("raced");

            const response = await createPayment(harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedProtectedPayment(body));
            expect(postgrestBudget(harness)).toEqual([
                ...reservationBudget,
                { method: "GET", table: "payments" },
                { method: "POST", table: "rpc/reserve_financial_operation" },
                { method: "PATCH", table: "financial_operations" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "PATCH", table: "financial_operations" },
            ]);
            expect(query(harness, 6)).toMatchObject({ client_reference_id: "eq.provider-order-1", limit: "1" });
            expect(postgrestBody(harness, 5)).toEqual({ p_payment: reservedPayment() });
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentCreateRequest(),
            ]);
            expect(harness.rest.rows("payments")).toHaveLength(1);
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({ status: "succeeded", stripe_object_id: "pi_1", attempt_count: 1 }),
            ]);
        });

        test("rethrows the exact reservation error when no concurrent payment exists", async () => {
            const harness = await preparedHarness(createHarness);
            harness.rest.failNextProtectedPaymentReservation("missing");

            const response = await createPayment(harness);

            expect(response.status).toBe(502);
            expect(await responseBody(response)).toEqual({ error: "simulated protected payment reservation failure" });
            expect(postgrestBudget(harness)).toEqual([...reservationBudget, { method: "GET", table: "payments" }]);
            expect(harness.rest.stripeRequests).toEqual([accountSyncRequest(), balanceSettingsRequest()]);
            expect(harness.rest.rows("payments")).toEqual([]);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
        });

        test("syncs and reuses the projected secret when reservation already links a PaymentIntent", async () => {
            const harness = await preparedHarness(createHarness);
            harness.rest.linkNextProtectedPaymentReservationToIntent();

            const response = await createPayment(harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedProtectedPayment(body));
            expect(postgrestBudget(harness)).toEqual([
                ...reservationBudget,
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentRequest("pi_1"),
            ]);
            expect(harness.rest.paymentIntentCreateCount).toBe(0);
            expect(harness.rest.rows("financial_operations")).toEqual([]);
        });

        test("retrieves and applies an already-succeeded operation without creating a PaymentIntent", async () => {
            const harness = await preparedHarness(createHarness);
            harness.rest.succeedNextPaymentIntentOperation();

            const response = await createPayment(harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(expectedProtectedPayment(body));
            expect(postgrestBudget(harness)).toEqual([
                ...reservationBudget,
                { method: "POST", table: "rpc/reserve_financial_operation" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentRequest("pi_1"),
            ]);
            expect(harness.rest.paymentIntentCreateCount).toBe(0);
            expect(harness.rest.rows("financial_operations")).toEqual([
                expect.objectContaining({ status: "succeeded", stripe_object_id: "pi_1", attempt_count: 1 }),
            ]);
        });
    });
}

async function preparedHarness(createHarness: CreateProviderBoundaryHarness): Promise<ProviderBoundaryHarness> {
    const harness = await createHarness();
    expect((await enrollSeller(harness)).status).toBe(200);
    clearRequests(harness);
    return harness;
}

async function createPayment(harness: ProviderBoundaryHarness): Promise<Response> {
    return await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
}

function query(harness: ProviderBoundaryHarness, index: number): Record<string, string> {
    return Object.fromEntries(harness.rest.postgrestRequests[index]?.searchParams ?? []);
}

function paymentIntentCreateRequest() {
    return {
        method: "POST",
        pathname: "/v1/payment_intents",
        searchParams: [],
        idempotencyKey: `payment:1:${financialTermsHash}`,
        stripeAccount: null,
    };
}

function reservedPayment() {
    return {
        client_reference_id: "provider-order-1",
        financial_terms_hash: financialTermsHash,
        financial_revision: 1,
        dual_approval_threshold_amount: 1000,
        buyer_cms_user_id: "buyer-1",
        seller_cms_user_id: "seller-1",
        seller_stripe_account_id: "acct_custom_identity_123",
        transfer_group: "cms_order_5a66e34d5f14d1ea34206f0ee2e0c236b961ff46e95cbb568d051704dae96881",
        currency: "eur",
        amount_total: 1200,
        seller_transfer_amount: 1080,
        platform_retained_amount: 120,
        payment_status: "created",
        settlement_status: "held",
        description: null,
    };
}
