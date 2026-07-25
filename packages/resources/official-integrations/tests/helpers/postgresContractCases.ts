import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type BundleName =
    | "commerceBuyerLegal"
    | "commerceNotifications"
    | "commerceNegotiatedCheckout"
    | "mondialRelay"
    | "stripeConnect";
export type ContractStep = { file: string; variables?: string[] };
export type PostgresContract = { bundle: BundleName; label: string; steps: ContractStep[] };

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
export const integrationRoots: Record<BundleName, string> = {
    commerceBuyerLegal: resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0"),
    commerceNotifications: resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0"),
    commerceNegotiatedCheckout: resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0"),
    mondialRelay: resolve(packageRoot, "integrations/providers/mondial-relay/versions/1.0.0"),
    stripeConnect: resolve(packageRoot, "integrations/providers/stripe-connect/versions/1.0.0"),
};

export const postgresContracts: PostgresContract[] = [
    contract(
        "Commerce pre-provider cancellation",
        "commerceBuyerLegal",
        "commerce/protected/payment/pre-provider-cancellation",
        ["run_pre_provider_cancellation_contract=true", "allow_pre_provider_cancellation_schema_reset=true"],
    ),
    contract("Commerce buyer legal acceptance", "commerceBuyerLegal", "commerce/protected/payment", [
        "run_buyer_legal_install_contract=true",
        "allow_buyer_legal_schema_reset=true",
    ]),
    contract("Commerce notification queue", "commerceNotifications", "commerce/sql/notifications", [
        "run_commerce_notification_install_contract=true",
        "allow_commerce_notification_schema_reset=true",
    ]),
    contract("Commerce negotiated checkout", "commerceNegotiatedCheckout", "commerce/order/price-agreement", [
        "run_price_agreement_install_contract=true",
        "allow_price_agreement_schema_reset=true",
    ]),
    contract("Mondial Relay label access", "mondialRelay", "mondial-relay/label-access", [
        "run_label_access_install_contract=true",
    ]),
    {
        bundle: "mondialRelay",
        label: "Mondial Relay selection",
        steps: [
            step("mondial-relay/relay-selection", "install.pg.sql", ["allow_relay_selection_schema_reset=true"]),
            step("mondial-relay/relay-selection"),
        ],
    },
    contract("Mondial Relay tracking summary", "mondialRelay", "mondial-relay/tracking-summary", [
        "run_tracking_summary_install_contract=true",
        "allow_tracking_summary_schema_reset=true",
    ]),
    contract("Stripe Connect payout schedule", "stripeConnect", "stripe-connect/accounts/payout-schedule", [
        "run_payout_schedule_install_contract=true",
        "allow_payout_schedule_schema_reset=true",
    ]),
    contract("Stripe Connect payment projection", "stripeConnect", "stripe-connect/payments/projection", [
        "run_payment_projection_install_contract=true",
        "allow_payment_projection_schema_reset=true",
    ]),
    contract("Stripe Connect dispute approval", "stripeConnect", "stripe-connect/provider-boundary/dispute-approval", [
        "run_dispute_approval_install_contract=true",
        "allow_dispute_approval_schema_reset=true",
    ]),
    contract("Stripe Connect provider reconciliation", "stripeConnect", "stripe-connect/provider-reconciliation", [
        "run_provider_reconciliation_install_contract=true",
        "allow_provider_reconciliation_schema_reset=true",
    ]),
];

function contract(label: string, bundle: BundleName, path: string, variables: string[]): PostgresContract {
    return { bundle, label, steps: [step(path, "contracts.pg.sql", variables)] };
}

function step(path: string, file = "contracts.pg.sql", variables?: string[]): ContractStep {
    return { file: `tests/${path}/postgres/${file}`, ...(variables ? { variables } : {}) };
}
