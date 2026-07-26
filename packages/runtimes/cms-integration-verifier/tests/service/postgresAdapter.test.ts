import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    parseVerificationJobResult,
} from "@bernouy/cms-integration-verification";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../src/runtime/providers/postgres";
import type { VerificationSandboxInput } from "../../src";
import { DIGEST_A, DIGEST_B } from "../fixtures/contracts";
import { sandboxInputFixture } from "../fixtures/workload";
import { disposablePostgresAvailable, startDisposablePostgres } from "./postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "runs the production install-and-reapply adapter against disposable PostgreSQL",
    async () => {
        const postgres = await startDisposablePostgres();
        const root = await mkdtemp(join(tmpdir(), "cms-verifier-production-adapter-"));
        try {
            const provider = await createDisposableVerificationDatabaseProviderFromEnv({
                CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
                CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
                CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
                CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
            });
            const lease = await provider.acquire(
                { candidateId: "candidate-1", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
                new AbortController().signal,
            );
            try {
                const result = await runAdapter(await productionInput(lease.credential), root);
                expect(result.results.find((entry) => entry.suiteId === "platform-install")).toMatchObject({
                    outcome: "passed",
                    attempts: 1,
                    cacheHit: false,
                });
                expect(result.results.find((entry) => entry.suiteId === "implementation")?.outcome).toBe("skipped");
                expect(await readdir(root)).toEqual([]);
            } finally {
                await lease.release();
            }
        } finally {
            await rm(root, { recursive: true, force: true });
            await postgres.close();
        }
    },
    45_000,
);

async function runAdapter(input: VerificationSandboxInput, cwd: string) {
    const child = Bun.spawn(
        [
            process.execPath,
            join(import.meta.dir, "../../src/sandbox/postgresMain.ts"),
            join(import.meta.dir, "../../src/sandbox/service/postgresAdapter.ts"),
            "platform-install",
        ],
        {
            cwd,
            env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", TZ: "UTC" },
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    child.stdin.write(canonicalJsonBytes(input));
    child.stdin.end();
    const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).arrayBuffer(),
        new Response(child.stderr).text(),
    ]);
    expect(status, stderr).toBe(0);
    return await parseVerificationJobResult(new Uint8Array(stdout));
}

async function productionInput(database: VerificationSandboxInput["database"]): Promise<VerificationSandboxInput> {
    const base = await sandboxInputFixture();
    const packageEnvelope = sqlPackage();
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    const verification = {
        ...base.workload.verification,
        target: { ...base.workload.verification.target, packageDigest },
    };
    const verificationDigest = await computeIntegrationVerificationDigest(verification);
    return {
        database,
        workload: {
            ...base.workload,
            package: packageEnvelope,
            verification,
            admission: {
                ...base.workload.admission,
                candidate: {
                    ...base.workload.admission.candidate,
                    packageDigest,
                    verificationDigest,
                },
            },
        },
    };
}

function sqlPackage(): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    kind: "example",
                    label: "Example",
                    version: "1.2.0",
                    inputs: [],
                    connectors: [
                        {
                            provider: "supabase",
                            root: "connectors/supabase",
                            schemas: [{ manifest: "sql/schema.manifest.json" }],
                            compatibility: { schema: { namespaces: [{ name: "verifier_probe", relations: [] }] } },
                        },
                    ],
                }),
            },
            "release-notes.md": { encoding: "utf8", content: "Production adapter proof" },
            "connectors/supabase/sql/schema.manifest.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    schema: "cms.integration.sql-bundle.v1",
                    transaction: "atomic",
                    entries: [{ file: "schema.sql" }],
                }),
            },
            "connectors/supabase/sql/schema.sql": {
                encoding: "utf8",
                content:
                    "create schema if not exists verifier_probe;\ncreate table if not exists verifier_probe.items (id bigint generated by default as identity primary key, name text not null);\n",
            },
        },
    };
}
