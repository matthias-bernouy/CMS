import { test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSupabaseSqlBundle } from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    POSTGRES_CONTRACT_RESET_CONFIRMATION,
    requireDisposablePostgresContractTarget,
} from "../../../../../tests/helpers/postgres/postgresContractTarget";

test.skipIf(process.env.ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET !== POSTGRES_CONTRACT_RESET_CONFIRMATION)(
    "preserves legacy negotiation and activates lifecycle emails after Commerce upgrades",
    async () => {
        const databaseUrl = requireDisposablePostgresContractTarget(process.env);
        const psql = Bun.which("psql");
        if (!psql) {
            throw new Error("PostgreSQL notification contracts require psql.");
        }
        const commerceRoot = join(OFFICIAL_INTEGRATIONS_ROOT, "domains/commerce/connectors/supabase");
        const negotiationRoot = join(OFFICIAL_INTEGRATIONS_ROOT, "extensions/commerce-negotiation/connectors/supabase");
        const [commerce, negotiation] = await Promise.all([
            loadSupabaseSqlBundle(commerceRoot, "install/sql/schema.manifest.json"),
            loadSupabaseSqlBundle(negotiationRoot, "sql/schema.manifest.json"),
        ]);
        const temp = await mkdtemp(join(tmpdir(), "cms-negotiation-capability-"));
        try {
            const commercePath = join(temp, "commerce.sql");
            const negotiationPath = join(temp, "negotiation.sql");
            await Promise.all([Bun.write(commercePath, commerce.sql), Bun.write(negotiationPath, negotiation.sql)]);
            const child = Bun.spawn(
                [
                    psql,
                    databaseUrl,
                    "--set=ON_ERROR_STOP=on",
                    "--quiet",
                    "--output",
                    join(temp, "results.log"),
                    "--command",
                    "set client_min_messages = warning",
                    `--set=commerce_schema_bundle=${commercePath}`,
                    `--set=negotiation_schema_bundle=${negotiationPath}`,
                    `--set=marketplace_notifications_repeatable=${join(commerceRoot, "repeatables/marketplace-notifications.sql")}`,
                    "--file",
                    fileURLToPath(new URL("capability.pg.sql", import.meta.url)),
                ],
                { stdout: "pipe", stderr: "pipe" },
            );
            const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
            if (code !== 0) {
                throw new Error(`Negotiation capability contract failed (${code}):\n${stderr.slice(-6000)}`);
            }
        } finally {
            await rm(temp, { recursive: true, force: true });
        }
    },
    30_000,
);
