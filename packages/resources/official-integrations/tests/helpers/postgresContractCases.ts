import { resolve } from "node:path";

export type BundleName =
    | "commerce"
    | "commerceNotifications"
    | "commerceNegotiatedCheckout"
    | "mondialRelay"
    | "salesConfigurator"
    | "stripeConnect";

export type ContractStep = { file: string; variables?: string[] };
export type PostgresContract = {
    bundle: BundleName;
    id: string;
    label: string;
    steps: ContractStep[];
};

export function postgresContractConfiguration(packageRoot: string): {
    contracts: PostgresContract[];
    integrationRoots: Record<BundleName, string>;
} {
    const commerce = resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0");
    const salesConfigurator = resolve(packageRoot, "integrations/domains/sales-configurator/versions/1.0.0");
    return {
        integrationRoots: {
            commerce,
            commerceNotifications: commerce,
            commerceNegotiatedCheckout: commerce,
            mondialRelay: resolve(packageRoot, "integrations/providers/mondial-relay/versions/1.0.0"),
            salesConfigurator,
            stripeConnect: resolve(packageRoot, "integrations/providers/stripe-connect/versions/1.0.0"),
        },
        contracts: [
            contract(
                "commerce-pre-provider-cancellation",
                "Commerce pre-provider cancellation",
                "commerce",
                "commerce/protected/payment/pre-provider-cancellation",
                ["run_pre_provider_cancellation_contract=true", "allow_pre_provider_cancellation_schema_reset=true"],
            ),
            contract(
                "commerce-buyer-legal-acceptance",
                "Commerce buyer legal acceptance",
                "commerce",
                "commerce/protected/payment",
                ["run_buyer_legal_install_contract=true", "allow_buyer_legal_schema_reset=true"],
            ),
            {
                bundle: "commerce",
                id: "commerce-protected-settlement",
                label: "Commerce protected settlement",
                steps: [
                    {
                        file: "tests/commerce/protected/postgres/settlement/contracts.pg.sql",
                        variables: [
                            "run_protected_settlement_contract=true",
                            "allow_protected_settlement_schema_reset=true",
                        ],
                    },
                ],
            },
            {
                bundle: "commerce",
                id: "commerce-protected-deadlines",
                label: "Commerce protected order deadlines",
                steps: [
                    step("commerce/protected", "deadlines/contracts.pg.sql", [
                        "run_protected_deadline_contract=true",
                        "allow_protected_deadline_schema_reset=true",
                    ]),
                ],
            },
            {
                bundle: "commerce",
                id: "commerce-fulfillment-truth",
                label: "Commerce fulfillment carrier truth",
                steps: [
                    step("commerce/protected", "fulfillment-truth/contracts.pg.sql", [
                        "run_fulfillment_truth_contract=true",
                        "allow_fulfillment_truth_schema_reset=true",
                    ]),
                ],
            },
            {
                bundle: "commerce",
                id: "commerce-service-withdrawal-requests",
                label: "Commerce service withdrawal requests",
                steps: [
                    step("commerce/sql/order", "service-withdrawal/contracts.pg.sql", [
                        "allow_service_withdrawal_schema_reset=true",
                    ]),
                ],
            },
            contract("commerce-media", "Commerce media lifecycle", "commerce", "commerce/selling/media", [
                "allow_commerce_media_schema_reset=true",
            ]),
            contract(
                "commerce-notifications",
                "Commerce notification queue",
                "commerceNotifications",
                "commerce/sql/notifications",
                ["run_commerce_notification_install_contract=true", "allow_commerce_notification_schema_reset=true"],
            ),
            contract(
                "commerce-negotiated-checkout",
                "Commerce negotiated checkout",
                "commerceNegotiatedCheckout",
                "commerce/order/price-agreement",
                ["run_price_agreement_install_contract=true", "allow_price_agreement_schema_reset=true"],
            ),
            contract(
                "mondial-relay-label-access",
                "Mondial Relay label access",
                "mondialRelay",
                "mondial-relay/label-access",
                ["run_label_access_install_contract=true"],
            ),
            {
                bundle: "mondialRelay",
                id: "mondial-relay-selection",
                label: "Mondial Relay selection",
                steps: [
                    step("mondial-relay/relay-selection", "install.pg.sql", [
                        "allow_relay_selection_schema_reset=true",
                    ]),
                    step("mondial-relay/relay-selection"),
                ],
            },
            contract(
                "mondial-relay-tracking-summary",
                "Mondial Relay tracking summary",
                "mondialRelay",
                "mondial-relay/tracking-summary",
                ["run_tracking_summary_install_contract=true", "allow_tracking_summary_schema_reset=true"],
            ),
            {
                bundle: "salesConfigurator",
                id: "sales-configurator",
                label: "Sales Configurator domain and authorization",
                steps: [
                    step("core-integrations/sales-configurator", "contracts.pg.sql", [
                        "allow_sales_configurator_schema_reset=true",
                    ]),
                    step("core-integrations/sales-configurator", "legacy-ownership-migration.pg.sql", [
                        "allow_sales_configurator_schema_reset=true",
                    ]),
                ],
            },
            contract(
                "stripe-connect-payout-schedule",
                "Stripe Connect payout schedule",
                "stripeConnect",
                "stripe-connect/accounts/payout-schedule",
                ["run_payout_schedule_install_contract=true", "allow_payout_schedule_schema_reset=true"],
            ),
            contract(
                "stripe-connect-payment-projection",
                "Stripe Connect payment projection",
                "stripeConnect",
                "stripe-connect/payments/projection",
                ["run_payment_projection_install_contract=true", "allow_payment_projection_schema_reset=true"],
            ),
            contract(
                "stripe-connect-dispute-approval",
                "Stripe Connect dispute approval",
                "stripeConnect",
                "stripe-connect/provider-boundary/dispute-approval",
                ["run_dispute_approval_install_contract=true", "allow_dispute_approval_schema_reset=true"],
            ),
            contract(
                "stripe-connect-provider-reconciliation",
                "Stripe Connect provider reconciliation",
                "stripeConnect",
                "stripe-connect/provider-reconciliation",
                [
                    "run_provider_reconciliation_install_contract=true",
                    "allow_provider_reconciliation_schema_reset=true",
                ],
            ),
        ],
    };
}

function contract(id: string, label: string, bundle: BundleName, path: string, variables: string[]): PostgresContract {
    return { bundle, id, label, steps: [step(path, "contracts.pg.sql", variables)] };
}

function step(path: string, file = "contracts.pg.sql", variables?: string[]): ContractStep {
    return { file: `tests/${path}/postgres/${file}`, ...(variables ? { variables } : {}) };
}
