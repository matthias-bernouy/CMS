import { lostPaymentTransferGroup } from "./expected-reconciliation";

export const expectedLostPaymentStripeRequests = [
    {
        method: "GET",
        pathname: "/v1/balance_settings",
        searchParams: [],
        idempotencyKey: null,
        stripeAccount: null,
    },
    {
        method: "GET",
        pathname: "/v1/payment_intents/pi_1",
        searchParams: [["expand[]", "latest_charge.balance_transaction"]],
        idempotencyKey: null,
        stripeAccount: null,
    },
    {
        method: "GET",
        pathname: "/v1/disputes",
        searchParams: [
            ["charge", "ch_1"],
            ["limit", "100"],
        ],
        idempotencyKey: null,
        stripeAccount: null,
    },
    {
        method: "GET",
        pathname: "/v1/refunds",
        searchParams: [
            ["charge", "ch_1"],
            ["limit", "100"],
        ],
        idempotencyKey: null,
        stripeAccount: null,
    },
    {
        method: "GET",
        pathname: "/v1/transfers",
        searchParams: [
            ["transfer_group", lostPaymentTransferGroup],
            ["limit", "100"],
        ],
        idempotencyKey: null,
        stripeAccount: null,
    },
];
