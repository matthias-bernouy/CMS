import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseSchemaSql } from "./supabaseSql";

type BundleName =
    | "commerceBuyerLegal"
    | "commerceNotifications"
    | "commerceNegotiatedCheckout"
    | "mondialRelay"
    | "stripeConnect";
type ContractStep = { file: string; variables?: string[] };
type PostgresContract = { bundle: BundleName; label: string; steps: ContractStep[] };

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const integrationRoots: Record<BundleName, string> = {
    commerceBuyerLegal: resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0"),
    commerceNotifications: resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0"),
    commerceNegotiatedCheckout: resolve(packageRoot, "integrations/domains/commerce/versions/1.0.0"),
    mondialRelay: resolve(packageRoot, "integrations/providers/mondial-relay/versions/1.0.0"),
    stripeConnect: resolve(packageRoot, "integrations/providers/stripe-connect/versions/1.0.0"),
};

const contracts: PostgresContract[] = [
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

async function main(): Promise<void> {
    const databaseUrl = requiredDatabaseUrl();
    const psql = Bun.which("psql");
    if (!psql) {
        throw new Error('The "psql" executable is required to run PostgreSQL contracts.');
    }
    const sql = await loadBundles();
    const tempRoot = await mkdtemp(join(tmpdir(), "cmscore-postgres-contracts-"));
    try {
        const bundleFiles = await writeBundles(tempRoot, sql);
        for (const contractCase of contracts) {
            for (const contractStep of contractCase.steps) {
                await runStep(psql, databaseUrl, bundleFiles[contractCase.bundle], contractCase, contractStep);
            }
        }
    } finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}

async function loadBundles(): Promise<Record<BundleName, string>> {
    const [commerceNotifications, commerce, negotiation, mondialRelay, stripeConnect] = await Promise.all([
        loadSupabaseSchemaSql(integrationRoots.commerceNotifications, "sql/foundation/notifications/manifest.json"),
        loadSupabaseSchemaSql(integrationRoots.commerceNegotiatedCheckout),
        loadSupabaseSchemaSql(resolve(packageRoot, "integrations/extensions/commerce-negotiation/versions/1.0.0")),
        loadSupabaseSchemaSql(integrationRoots.mondialRelay),
        loadSupabaseSchemaSql(integrationRoots.stripeConnect),
    ]);
    return {
        commerceBuyerLegal: commerce,
        commerceNotifications,
        commerceNegotiatedCheckout: `${commerce}\n${negotiation}`,
        mondialRelay,
        stripeConnect,
    };
}

async function writeBundles(root: string, sql: Record<BundleName, string>): Promise<Record<BundleName, string>> {
    const files = {
        commerceBuyerLegal: join(root, "commerce-buyer-legal.sql"),
        commerceNotifications: join(root, "commerce-notification-module.sql"),
        commerceNegotiatedCheckout: join(root, "commerce-negotiated-checkout.sql"),
        mondialRelay: join(root, "mondial-relay.sql"),
        stripeConnect: join(root, "stripe-connect.sql"),
    };
    await Promise.all([
        writeFile(files.commerceBuyerLegal, sql.commerceBuyerLegal),
        writeFile(files.commerceNotifications, sql.commerceNotifications),
        writeFile(files.commerceNegotiatedCheckout, sql.commerceNegotiatedCheckout),
        writeFile(files.mondialRelay, sql.mondialRelay),
        writeFile(files.stripeConnect, sql.stripeConnect),
    ]);
    return files;
}

async function runStep(
    psql: string,
    databaseUrl: string,
    bundle: string,
    contractCase: PostgresContract,
    contractStep: ContractStep,
): Promise<void> {
    const script = resolve(packageRoot, contractStep.file);
    console.info(`[postgres-contracts] ${contractCase.label}: ${script}`);
    const process = Bun.spawn(
        [
            psql,
            "--dbname",
            databaseUrl,
            "--set=ON_ERROR_STOP=on",
            `--set=cms_integration_schema_bundle=${bundle}`,
            ...(contractStep.variables ?? []).map((value) => `--set=${value}`),
            "--file",
            script,
        ],
        { stderr: "inherit", stdin: "inherit", stdout: "inherit" },
    );
    const exitCode = await process.exited;
    if (exitCode !== 0) {
        throw new Error(`${contractCase.label} failed with psql exit code ${exitCode}.`);
    }
}

function requiredDatabaseUrl(): string {
    const value = process.env.DATABASE_URL?.trim();
    if (!value) {
        throw new Error("DATABASE_URL is required and must target a disposable PostgreSQL database.");
    }
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
    }
    return value;
}

function contract(label: string, bundle: BundleName, path: string, variables: string[]): PostgresContract {
    return { bundle, label, steps: [step(path, "contracts.pg.sql", variables)] };
}

function step(path: string, file = "contracts.pg.sql", variables?: string[]): ContractStep {
    return { file: `tests/${path}/postgres/${file}`, ...(variables ? { variables } : {}) };
}

await main().catch((error: unknown) => {
    console.error(`[postgres-contracts] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
