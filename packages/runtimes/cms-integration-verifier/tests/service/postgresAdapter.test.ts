import { SQL } from "bun";
import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonBytes, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import {
    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1,
    buildBehavioralRlsPlan,
    buildIntegrationVerificationSuiteContent,
    computeIntegrationVerificationDigest,
    identifyIntegrationVerificationSuiteContent,
    parseCandidateAdmissionJobResult,
} from "@bernouy/cms-integration-verification";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../src/runtime/providers/postgres";
import type { VerificationSandboxInput } from "../../src";
import { DIGEST_A, DIGEST_B } from "../fixtures/contracts";
import { postgresPlatformInputFixture } from "../fixtures/postgresAdapter";
import {
    disposablePostgresAvailable,
    markDisposablePostgresDedicated,
    startDisposablePostgres,
} from "./postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "runs the production install-and-reapply adapter against disposable PostgreSQL",
    async () => {
        const postgres = await startDisposablePostgres();
        const root = await mkdtemp(join(tmpdir(), "cms-verifier-production-adapter-"));
        try {
            await markDisposablePostgresDedicated(postgres);
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
                expect(result.results.filter((entry) => entry.platformEvidence)).toHaveLength(
                    POSTGRES_PLATFORM_VERIFICATION_SUITES_V1.length,
                );
                expect(result.results.find((entry) => entry.suiteId === "platform-postgres-rls-shape")).toMatchObject({
                    outcome: "passed",
                    attempts: 1,
                    cacheHit: false,
                });
                expect(
                    result.results.find((entry) => entry.suiteId === "platform-postgres-rls-behavior"),
                ).toMatchObject({
                    outcome: "passed",
                    platformEvidence: {
                        checks: [
                            { checkId: "supabase-rls-runtime", outcome: "passed" },
                            { checkId: "tenant-read-isolation", outcome: "passed", subjectCount: 0 },
                            { checkId: "tenant-write-isolation", outcome: "passed", subjectCount: 0 },
                        ],
                    },
                });
                expect(
                    result.results.find((entry) => entry.suiteId === "platform-postgres-schema-contract")?.outcome,
                ).toBe("passed");
                expect(result.results.find((entry) => entry.suiteId === "implementation")?.outcome).toBe("passed");
                const database = new SQL(lease.credential.connectionUri, { max: 1 });
                try {
                    const rows = (await database.unsafe(
                        "select count(*)::integer as count from verifier_probe.items",
                    )) as Array<{ count: number }>;
                    expect(rows[0]?.count).toBe(0);
                } finally {
                    await database.close();
                }
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
    return (await parseCandidateAdmissionJobResult(new Uint8Array(stdout))).verification;
}

async function productionInput(database: VerificationSandboxInput["database"]): Promise<VerificationSandboxInput> {
    const input = await postgresPlatformInputFixture(sqlPackage());
    const verification = {
        ...input.workload.verification,
        files: {
            ...input.workload.verification.files,
            "tests/implementation.ts": {
                encoding: "utf8" as const,
                content:
                    'import { defineSuite, expect, test } from "@bernouy/cms-integration-verification/sdk/v1"; ' +
                    'export default defineSuite({ tests: [test("rollback", async ({ query }) => { ' +
                    'await query("insert into verifier_probe.items(name) values ($1)", ["temporary"]); ' +
                    'const rows = await query("select count(*)::integer as count from verifier_probe.items"); ' +
                    "expect(rows).toEqual([{ count: 1 }]); })] });",
            },
        },
    };
    const identified = await identifyIntegrationVerificationSuiteContent(
        await buildIntegrationVerificationSuiteContent(verification, "conformance", "implementation"),
    );
    const verificationDigest = await computeIntegrationVerificationDigest(verification);
    const candidate = { ...input.workload.admission.candidate, verificationDigest };
    const { candidateId: _candidateId, ...behavioralRlsTarget } = candidate;
    const behavioralRlsPlan = await buildBehavioralRlsPlan({
        verification,
        target: behavioralRlsTarget,
        policyDigest: input.workload.admission.policyDigest,
    });
    return {
        ...input,
        database,
        workload: {
            ...input.workload,
            verification,
            behavioralRlsPlan: { digest: behavioralRlsPlan.digest, plan: behavioralRlsPlan.plan },
            admission: {
                ...input.workload.admission,
                candidate,
                behavioralRlsPlan: { digest: behavioralRlsPlan.digest, plan: behavioralRlsPlan.plan },
                suites: input.workload.admission.suites.map((suite) =>
                    suite.suiteId === "implementation" ? { ...suite, contentDigest: identified.digest } : suite,
                ),
            },
            authorSuites: [
                {
                    suiteId: "implementation",
                    source: "author-conformance",
                    contentDigest: identified.digest,
                    content: identified.content,
                },
            ],
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
                            dataApiSchemas: ["verifier_probe"],
                            schemas: [{ manifest: "sql/schema.manifest.json" }],
                            compatibility: {
                                schema: {
                                    namespaces: [
                                        {
                                            name: "verifier_probe",
                                            relations: [
                                                {
                                                    name: "items",
                                                    kind: "table",
                                                    columns: [
                                                        {
                                                            name: "id",
                                                            type: "bigint",
                                                            nullable: false,
                                                            identity: "by-default",
                                                            sequenceDependency: "internal",
                                                        },
                                                        { name: "name", type: "text", nullable: false },
                                                    ],
                                                    constraints: [
                                                        {
                                                            kind: "primary-key",
                                                            name: "items_pkey",
                                                            columns: ["id"],
                                                            deferrable: false,
                                                            initiallyDeferred: false,
                                                            validated: true,
                                                        },
                                                    ],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
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
                    "create schema if not exists verifier_probe;\n" +
                    "revoke all on schema verifier_probe from public, anon, authenticated;\n" +
                    "create table if not exists verifier_probe.items (id bigint generated by default as identity primary key, name text not null);\n" +
                    "alter table verifier_probe.items enable row level security;\n" +
                    "alter table verifier_probe.items force row level security;\n" +
                    "drop policy if exists verifier_test_access on verifier_probe.items;\n" +
                    "create policy verifier_test_access on verifier_probe.items using (true) with check (true);\n" +
                    "revoke all on all tables in schema verifier_probe from public, anon, authenticated;\n" +
                    "revoke all on all functions in schema verifier_probe from public, anon, authenticated;\n" +
                    "create or replace function verifier_probe.secure_probe() returns bigint language sql security definer set search_path = '' as 'select 1::bigint';\n" +
                    "revoke all on function verifier_probe.secure_probe() from public, anon, authenticated;\n" +
                    "grant usage on schema verifier_probe to service_role;\n" +
                    "grant select, insert, update, delete on all tables in schema verifier_probe to service_role;\n",
            },
        },
    };
}
