import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    postgresContractConfiguration,
    type BundleName,
    type ContractStep,
    type PostgresContract,
} from "./postgresContractCases";
import { requireDisposablePostgresContractTarget } from "./postgresContractTarget";
import { loadSupabaseSchemaSql } from "./supabaseSql";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const configuration = postgresContractConfiguration(packageRoot);

async function main(): Promise<void> {
    const databaseUrl = requireDisposablePostgresContractTarget(process.env);
    const psql = Bun.which("psql");
    if (!psql) {
        throw new Error('The "psql" executable is required to run PostgreSQL contracts.');
    }
    const contracts = selectedContracts(configuration.contracts);
    const sql = await loadBundles();
    const tempRoot = await mkdtemp(join(tmpdir(), "cmscore-postgres-contracts-"));
    try {
        const bundleFiles = await writeBundles(tempRoot, sql);
        for (const contractCase of contracts) {
            for (const contractStep of contractCase.steps) {
                await runStep(psql, databaseUrl, bundleFiles[contractCase.bundle], contractCase, contractStep);
            }
            if (contractCase.id === "commerce-media") {
                await runCommerceMediaRolloutProofs(databaseUrl);
            }
        }
    } finally {
        await rm(tempRoot, { force: true, recursive: true });
    }
}

function selectedContracts(contracts: PostgresContract[]): PostgresContract[] {
    const filterIndex = Bun.argv.indexOf("--filter");
    if (filterIndex < 0) {
        return contracts;
    }
    const filter = Bun.argv[filterIndex + 1]?.trim();
    if (!filter) {
        throw new Error("--filter requires an exact PostgreSQL contract id.");
    }
    const selected = contracts.filter((contract) => contract.id === filter);
    if (!selected.length) {
        throw new Error(`Unknown PostgreSQL contract filter "${filter}".`);
    }
    return selected;
}

async function loadBundles(): Promise<Record<BundleName, string>> {
    const [commerceNotifications, commerce, negotiation, mondialRelay, salesConfigurator, stripeConnect] =
        await Promise.all([
            loadSupabaseSchemaSql(
                configuration.integrationRoots.commerceNotifications,
                "sql/foundation/notifications/manifest.json",
            ),
            loadSupabaseSchemaSql(configuration.integrationRoots.commerce),
            loadSupabaseSchemaSql(resolve(packageRoot, "integrations/extensions/commerce-negotiation/versions/1.0.0")),
            loadSupabaseSchemaSql(configuration.integrationRoots.mondialRelay),
            loadSupabaseSchemaSql(configuration.integrationRoots.salesConfigurator),
            loadSupabaseSchemaSql(configuration.integrationRoots.stripeConnect),
        ]);
    return {
        commerce,
        commerceNotifications,
        commerceNegotiatedCheckout: `${commerce}\n${negotiation}`,
        mondialRelay,
        salesConfigurator,
        stripeConnect,
    };
}

async function writeBundles(root: string, sql: Record<BundleName, string>): Promise<Record<BundleName, string>> {
    const files: Record<BundleName, string> = {
        commerce: join(root, "commerce.sql"),
        commerceNotifications: join(root, "commerce-notification-module.sql"),
        commerceNegotiatedCheckout: join(root, "commerce-negotiated-checkout.sql"),
        mondialRelay: join(root, "mondial-relay.sql"),
        salesConfigurator: join(root, "sales-configurator.sql"),
        stripeConnect: join(root, "stripe-connect.sql"),
    };
    await Promise.all(
        (Object.entries(files) as [BundleName, string][]).map(([name, file]) => writeFile(file, sql[name])),
    );
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

async function runCommerceMediaRolloutProofs(databaseUrl: string): Promise<void> {
    const tests = [
        resolve(packageRoot, "tests/commerce/selling/media/postgres/rollout/legacyEdge.test.ts"),
        resolve(packageRoot, "tests/commerce/selling/media/postgres/rollout/rerun.test.ts"),
    ];
    console.info("[postgres-contracts] Commerce media rollout compatibility and rerun");
    const child = Bun.spawn([process.execPath, "test", ...tests], {
        env: {
            ...process.env,
            ALLOW_COMMERCE_MEDIA_SCHEMA_RESET: "true",
            DATABASE_URL: databaseUrl,
        },
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) {
        throw new Error(`Commerce media rollout proofs failed with Bun exit code ${exitCode}.`);
    }
}

await main().catch((error: unknown) => {
    console.error(`[postgres-contracts] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
