import { SQL } from "bun";
import { expect, test } from "bun:test";
import { createDisposableVerificationDatabaseProviderFromEnv } from "../../../../src/runtime/providers/postgres";
import {
    readGrantObservation,
    readRlsObservation,
    readRoleMembershipObservation,
    readRoutineObservation,
    readUnknownSurfaceObservation,
    readViewObservation,
} from "../../../../src/sandbox/service/postgres/catalog";
import { grantChecks, routineChecks, viewChecks } from "../../../../src/sandbox/service/postgres/checks/security";
import { DIGEST_A, DIGEST_B } from "../../../fixtures/contracts";
import {
    disposablePostgresAvailable,
    markDisposablePostgresDedicated,
    startDisposablePostgres,
} from "../../postgresFixture";

const postgresTest = disposablePostgresAvailable ? test : test.skip;

postgresTest(
    "observes the exact effective Data API surface and transitive role memberships",
    async () => {
        const postgres = await startDisposablePostgres();
        await markDisposablePostgresDedicated(postgres);
        const provider = await createDisposableVerificationDatabaseProviderFromEnv({
            CMS_INTEGRATION_VERIFIER_POSTGRES_HOST: postgres.host,
            CMS_INTEGRATION_VERIFIER_POSTGRES_PORT: String(postgres.port),
            CMS_INTEGRATION_VERIFIER_POSTGRES_USER: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_DATABASE: "postgres",
            CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_FILE: postgres.passwordFile,
        });
        const lease = await provider.acquire(
            { candidateId: "catalog", packageDigest: DIGEST_A, verificationDigest: DIGEST_B },
            new AbortController().signal,
        );
        const database = new SQL(lease.credential.connectionUri, { max: 1 });
        const adminTarget = new URL(lease.credential.connectionUri);
        adminTarget.username = "postgres";
        adminTarget.password = postgres.password;
        adminTarget.searchParams.delete("options");
        const admin = new SQL(adminTarget.toString(), { max: 1 });
        let privilegedMembership = false;
        try {
            await installCatalogFixture(database);
            const schemas = ["verifier_catalog"];
            const grants = await readGrantObservation(database, schemas);
            expect([...new Set(grants.map(({ objectType }) => objectType))].toSorted()).toEqual([
                "column",
                "relation",
                "routine",
                "schema",
                "sequence",
            ]);
            expect(grants).toContainEqual(
                expect.objectContaining({
                    objectType: "column",
                    objectName: "records.id",
                    grantee: "anon",
                    privilege: "SELECT",
                }),
            );
            expect(codes(await grantChecks(grants, [], []))).toContain("postgres-data-api-elevated-column-privilege");
            const rls = await readRlsObservation(database, schemas);
            expect(rls.relations).toEqual([
                expect.objectContaining({ rlsEnabled: true, rlsForced: true, exposedRoles: ["anon", "authenticated"] }),
            ]);
            expect(await readViewObservation(database, schemas)).toEqual([
                expect.objectContaining({ securityInvoker: true, selectGrantees: ["authenticated"] }),
            ]);
            expect(await readRoutineObservation(database, schemas)).toEqual([
                expect.objectContaining({ securityDefiner: true, executeGrantees: ["authenticated"] }),
            ]);
            expect(await readUnknownSurfaceObservation(database, schemas)).toEqual([]);
            expect(await readRoleMembershipObservation(database)).toEqual([]);

            await admin.unsafe(`alter view verifier_catalog.record_ids_view owner to authenticated;
                alter function verifier_catalog.current_record() owner to authenticated`);
            const externalViews = await readViewObservation(database, schemas);
            expect(externalViews).toEqual([expect.objectContaining({ ownedBySessionRole: false })]);
            const externalRoutines = await readRoutineObservation(database, schemas);
            expect(externalRoutines).toEqual([expect.objectContaining({ ownedBySessionRole: false })]);
            expect(codes(await viewChecks(externalViews))).toContain("postgres-view-external-owner");
            expect(codes(await routineChecks(externalRoutines))).toContain("postgres-security-definer-external-owner");

            await admin.unsafe("grant service_role to authenticated with inherit true, set false");
            privilegedMembership = true;
            const memberships = await readRoleMembershipObservation(database);
            expect(memberships).toEqual([
                expect.objectContaining({
                    actor: "authenticated",
                    inheritedRole: "service_role",
                    depth: 1,
                    bypassRls: true,
                }),
            ]);
            const grantEvidence = await grantChecks([], memberships, [
                { namespace: "verifier_catalog", objectName: "future_surface", kind: "?", exposedRoles: ["anon"] },
            ]);
            expect(codes(grantEvidence)).toEqual(
                expect.arrayContaining([
                    "postgres-data-api-privileged-role-membership",
                    "postgres-unknown-data-api-surface",
                ]),
            );
        } finally {
            if (privilegedMembership) {
                await admin.unsafe("revoke service_role from authenticated");
            }
            await admin.close();
            await database.close();
            await lease.release();
            await postgres.close();
        }
    },
    30_000,
);

async function installCatalogFixture(database: SQL): Promise<void> {
    await database.unsafe(`create schema verifier_catalog;
      create table verifier_catalog.records (id bigint primary key, owner_id uuid not null);
      alter table verifier_catalog.records enable row level security;
      alter table verifier_catalog.records force row level security;
      create policy records_read on verifier_catalog.records for select to anon, authenticated using (true);
      create sequence verifier_catalog.record_ids;
      create view verifier_catalog.record_ids_view with (security_invoker = true) as
        select id from verifier_catalog.records;
      create function verifier_catalog.current_record() returns bigint language sql security definer
        set search_path = pg_catalog as
        $$ select 1::bigint $$;
      revoke all on function verifier_catalog.current_record() from public;
      grant usage on schema verifier_catalog to anon, authenticated;
      grant select (id) on verifier_catalog.records to anon;
      grant select, delete on verifier_catalog.records to authenticated;
      grant references (owner_id) on verifier_catalog.records to authenticated;
      grant usage on sequence verifier_catalog.record_ids to authenticated;
      grant select on verifier_catalog.record_ids_view to authenticated;
      grant execute on function verifier_catalog.current_record() to authenticated`);
}

function codes(evidence: readonly Readonly<{ findings: readonly Readonly<{ code: string }>[] }>[]): string[] {
    return evidence.flatMap((check) => check.findings.map(({ code }) => code)).toSorted();
}
