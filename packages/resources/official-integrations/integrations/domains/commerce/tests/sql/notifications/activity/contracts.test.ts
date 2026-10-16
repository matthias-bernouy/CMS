import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    computeSupabaseInstallDigest,
    loadSupabaseRepeatableAssets,
    loadSupabaseSqlBundle,
} from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    POSTGRES_CONTRACT_RESET_CONFIRMATION,
    requireDisposablePostgresContractTarget,
} from "../../../../../../../tests/helpers/postgres/postgresContractTarget";

const connectorRoot = join(OFFICIAL_INTEGRATIONS_ROOT, "domains/commerce/connectors/supabase");
const negotiationRoot = join(OFFICIAL_INTEGRATIONS_ROOT, "extensions/commerce-negotiation/connectors/supabase");

test("the marketplace notification upgrade matches the install and has a valid checksum", async () => {
    const connectors = await Bun.file(join(connectorRoot, "../../definitions/configuration/connectors.json")).json();
    const descriptor = connectors[0].migration.repeatables.find(
        (entry: { id: string }) => entry.id === "commerce-marketplace-notifications",
    );
    expect(descriptor).toBeDefined();
    const [asset] = await loadSupabaseRepeatableAssets(connectorRoot, [descriptor]);
    const bundle = await loadSupabaseSqlBundle(connectorRoot, "install/sql/schema.manifest.json");
    expect(connectors[0].migration.install.digest).toBe(await computeSupabaseInstallDigest([bundle]));
    for (const [, path] of asset.sql.matchAll(/^-- Source: (.+)$/gm)) {
        expect(asset.sql).toContain((await Bun.file(join(connectorRoot, path)).text()).trim());
    }
});

test.skipIf(process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET !== POSTGRES_CONTRACT_RESET_CONFIRMATION)(
    "queues offer and proposal lifecycle emails with isolated recipients and replay-safe upgrades in PostgreSQL",
    async () => {
        const databaseUrl = requireDisposablePostgresContractTarget(process.env);
        const psql = Bun.which("psql");
        if (!psql) {
            throw new Error("PostgreSQL notification contracts require psql.");
        }
        const [commerce, negotiation] = await Promise.all([
            loadSupabaseSqlBundle(connectorRoot, "install/sql/schema.manifest.json"),
            loadSupabaseSqlBundle(negotiationRoot, "sql/schema.manifest.json"),
        ]);
        const temp = await mkdtemp(join(tmpdir(), "cms-notification-lifecycle-"));
        try {
            const bundlePath = join(temp, "install.sql");
            await Bun.write(bundlePath, `${commerce.sql}\n${negotiation.sql}`);
            const legacyRuntime = await Bun.file(join(connectorRoot, "repeatables/commerce-1.1.0.sql")).text();
            const legacyClaim = legacyRuntime
                .split("-- Source: install/sql/foundation/notifications/claim.sql\n")[1]
                ?.split("-- Source:")[0];
            if (!legacyClaim) {
                throw new Error("Legacy notification claim definition is missing");
            }
            const legacyPath = join(temp, "legacy-claim.sql");
            await Bun.write(legacyPath, legacyClaim);
            const child = Bun.spawn(
                [
                    psql,
                    "--dbname",
                    databaseUrl,
                    "--set=ON_ERROR_STOP=on",
                    "--quiet",
                    "--output",
                    join(temp, "results.log"),
                    "--command",
                    "set client_min_messages = warning",
                    `--set=legacy_notification_claim=${legacyPath}`,
                    `--set=cms_integration_schema_bundle=${bundlePath}`,
                    `--set=marketplace_notifications_repeatable=${join(connectorRoot, "repeatables/marketplace-notifications.sql")}`,
                    "--file",
                    fileURLToPath(new URL("contracts.pg.sql", import.meta.url)),
                ],
                { stdout: "pipe", stderr: "pipe" },
            );
            const [code, stdout, stderr] = await Promise.all([
                child.exited,
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
            ]);
            if (code !== 0) {
                throw new Error(
                    `PostgreSQL notification contract failed (${code}):\n${stdout.slice(-2000)}\n${stderr.slice(-6000)}`,
                );
            }
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    },
    30_000,
);
