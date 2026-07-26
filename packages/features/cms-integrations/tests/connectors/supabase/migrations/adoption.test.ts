import { describe, expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    InMemoryIntegrationConnectorProviderRepository,
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    type IntegrationConnectorBaselineAdoptionContext,
    type ObservedSchemaContractV1,
} from "@bernouy/cms-integrations";
import { ConfiguredSupabaseConnectorBaselineAdopter } from "@bernouy/cms-integrations/supabase";

const BASELINE: ObservedSchemaContractV1 = {
    schema: "cms.integration.observed-schema.v1",
    owner: { connectorKey: "primary", lineageId: "commerce-supabase-v1" },
    namespaces: [{ name: "commerce", relations: [] }],
};
const COVERED_MIGRATION = {
    id: "initial-schema",
    checksum: `sha256:${"c".repeat(64)}` as const,
    revision: 1,
    introducedIn: "1.0.0",
};

describe("Supabase legacy connector baseline adopter", () => {
    test("introspects the exact schema before transactionally recording an immutable identity", async () => {
        const fixture = await adopterFixture();

        const result = await fixture.adopter.adopt(adoptionContext());

        expect(result).toMatchObject({
            externalOperationId: `supabase-baseline:connector-instance-1:${result.baselineDigest}`,
            outputs: { functionsBaseUrl: "https://project-one.supabase.co/functions/v1" },
        });
        expect(result.baselineDigest).toMatch(/^[a-f0-9]{64}$/);
        expect(fixture.queries.slice(0, 4).every((query) => query.includes("ARRAY['commerce']::text[]"))).toBeTrue();
        const transaction = fixture.queries.find((query) => query.startsWith("BEGIN;"));
        expect(transaction).toContain("pg_advisory_xact_lock");
        expect(transaction!.indexOf("cms-integration-runtime-schema-v1")).toBeLessThan(
            transaction!.indexOf("CREATE SCHEMA"),
        );
        expect(transaction).toContain("cms integration legacy baseline conflict");
        expect(transaction).toContain("cms integration legacy adoption ledger conflict");
        expect(transaction).toContain("source_package_digest");
        expect(transaction).toContain("ON CONFLICT");
        expect(transaction).toEndWith("COMMIT;");
        const confirmation = fixture.queries.find((query) => query.startsWith("SELECT migration_revision"));
        expect(confirmation).toContain("migration_ledger");
        expect(confirmation).toContain("ledger.target_package_digest IS NULL");
        expect(confirmation).toContain("ledger.fencing_token IS NULL");
        expect(fixture.authorizations.every((value) => value === "Bearer sbp_secret")).toBeTrue();
    });

    test("does not mutate the ledger when the observed schema differs from the signed baseline", async () => {
        const fixture = await adopterFixture({ includeUnexpectedRelation: true });

        await expect(fixture.adopter.adopt(adoptionContext())).rejects.toMatchObject({ status: 409 });
        expect(fixture.queries.some((query) => query.startsWith("BEGIN;"))).toBeFalse();
        expect(fixture.queries.some((query) => query.includes("connector_instances\nWHERE"))).toBeFalse();
    });

    test("rejects an adoption context that omits part of the signed source ledger", async () => {
        const fixture = await adopterFixture();

        await expect(fixture.adopter.adopt({ ...adoptionContext(), coveredMigrations: [] })).rejects.toThrow(
            /bind the exact source package/,
        );
        expect(fixture.queries.some((query) => query.startsWith("BEGIN;"))).toBeFalse();
    });

    test("redacts the current access token from Management API failures", async () => {
        const fixture = await adopterFixture({ failWithToken: true });

        const error = await capturedError(fixture.adopter.adopt(adoptionContext()));
        expect(error.message).toContain("[redacted]");
        expect(error.message).not.toContain("sbp_secret");
    });
});

async function adopterFixture(options: { includeUnexpectedRelation?: boolean; failWithToken?: boolean } = {}) {
    const providerRepository = new InMemoryIntegrationConnectorProviderRepository({
        provider: "supabase",
        enabled: true,
        projectRef: "project-one",
    });
    const secrets = new InMemorySecretStore();
    await secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, "sbp_secret");
    const queries: string[] = [];
    const authorizations: Array<string | null> = [];
    const adopter = new ConfiguredSupabaseConnectorBaselineAdopter({
        providerRepository,
        secrets,
        apiBaseUrl: "https://api.supabase.test",
        fetch: async (_input, init) => {
            authorizations.push(new Headers(init?.headers).get("authorization"));
            if (options.failWithToken) {
                return new Response("rejected sbp_secret", { status: 500 });
            }
            const query = String((JSON.parse(String(init?.body)) as { query?: unknown }).query ?? "");
            queries.push(query);
            return Response.json(rowsForQuery(query, options.includeUnexpectedRelation ?? false));
        },
    });
    return { adopter, queries, authorizations };
}

function rowsForQuery(query: string, includeUnexpectedRelation: boolean): Record<string, unknown>[] {
    if (query.includes("pg_catalog.pg_constraint")) {
        return [];
    }
    if (query.includes("pg_catalog.pg_attribute")) {
        return [];
    }
    if (query.includes("relation.relkind in")) {
        return includeUnexpectedRelation
            ? [{ namespace_name: "commerce", relation_name: "unexpected", relation_kind: "r" }]
            : [];
    }
    if (query.includes("from pg_catalog.pg_namespace as namespace")) {
        return [{ namespace_name: "commerce" }];
    }
    if (query.startsWith("SELECT migration_revision")) {
        return [{ migration_revision: 1, baseline_digest: "digest", package_version: "1.0.0" }];
    }
    return [];
}

function adoptionContext(): IntegrationConnectorBaselineAdoptionContext {
    return {
        integrationKind: "commerce",
        sourceVersion: "1.0.0",
        sourcePackageDigest: "a".repeat(64),
        targetVersion: "1.1.0",
        targetPackageDigest: "b".repeat(64),
        connectorKey: "primary",
        provider: "supabase",
        lineageId: "commerce-supabase-v1",
        connectorInstanceId: "connector-instance-1",
        migrationRevision: 1,
        baseline: {
            definitionVersion: "1.0.0",
            packageDigest: "a".repeat(64),
            observedSchema: BASELINE,
            coveredMigrations: [COVERED_MIGRATION],
        },
        coveredMigrations: [COVERED_MIGRATION],
        attemptId: "attempt-1",
    };
}

async function capturedError(promise: Promise<unknown>): Promise<Error> {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(Error);
        return error as Error;
    }
    throw new Error("expected operation to fail");
}
