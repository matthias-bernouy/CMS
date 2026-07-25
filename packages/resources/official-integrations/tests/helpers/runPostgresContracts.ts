import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    integrationRoots,
    postgresContracts,
    type BundleName,
    type ContractStep,
    type PostgresContract,
} from "./postgresContractCases";
import { loadSupabaseSchemaSql } from "./supabaseSql";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

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
        for (const contractCase of postgresContracts) {
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

await main().catch((error: unknown) => {
    console.error(`[postgres-contracts] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
