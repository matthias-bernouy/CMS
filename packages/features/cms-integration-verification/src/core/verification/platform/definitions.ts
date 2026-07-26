import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    PLATFORM_VERIFICATION_SUITE_DEFINITION_SCHEMA,
    type PlatformVerificationSuiteDefinitionV1,
} from "../../../interfaces/verification";

export const POSTGRES_PLATFORM_VERIFICATION_SUITES_V1 = Object.freeze([
    suite(
        "platform-package-materialization",
        "always",
        ["materialized-definition"],
        ["The exact package materializes and its definition resolves inside the bounded sandbox."],
    ),
    suite(
        "platform-declared-http-contracts",
        "always",
        ["function-contract-declarations", "source-endpoint-coverage"],
        [
            "Every declared connector function carries a bounded, parsed HTTP contract when functions are present.",
            "Every CMS Source endpoint targeting a connector function is covered by an exact declared method and route.",
        ],
        ["Edge Function execution", "runtime HTTP behavior", "PostgREST behavior"],
    ),
    suite(
        "platform-dependency-matrix",
        "always",
        ["exact-resolution-points"],
        [
            "Every required direct dependency has exact minimum and stable admission references satisfying its declared range.",
            "Every recorded dependency resolution point is bound to a package digest.",
        ],
        [
            "dependency package execution",
            "transitive dependency declarations without supplied dependency package bytes",
        ],
    ),
    suite(
        "platform-postgres-install-reapply",
        "sql-connectors",
        ["clean-install", "same-database-reapply", "schema-idempotence"],
        ["Candidate SQL installs and reapplies on one disposable PostgreSQL database without schema drift."],
        ["Supabase Management API", "PostgREST", "Edge Functions", "secrets", "provider provisioning"],
    ),
    suite(
        "platform-postgres-owned-roots",
        "sql-connectors",
        ["install-boundary", "reapply-boundary"],
        ["Candidate SQL does not change catalog or fixture data outside declared owned namespaces."],
    ),
    suite(
        "platform-postgres-schema-contract",
        "sql-connectors",
        ["declared-observed-consistency"],
        ["The exact observed schema projection equals the candidate's declarative schema contract."],
    ),
    suite(
        "platform-postgres-rls-shape",
        "data-api-schemas",
        ["rls-enabled", "policy-shape"],
        ["Tables in declared Data API schemas enable RLS and policies have structurally safe clauses."],
        ["behavioral tenant isolation", "PostgREST request execution", "JWT authorization semantics"],
    ),
    suite(
        "platform-postgres-grants",
        "data-api-schemas",
        ["data-api-grants"],
        ["Data API schemas do not expose unsafe PUBLIC or grant-option privileges."],
        ["application-specific authorization intent"],
    ),
    suite(
        "platform-postgres-view-security",
        "data-api-schemas",
        ["invoker-or-unexposed"],
        ["Views reachable by unprivileged Data API roles use invoker security."],
        ["behavioral view queries through PostgREST"],
    ),
    suite(
        "platform-postgres-privileged-functions",
        "sql-connectors",
        ["security-definer-hardening", "execution-exposure"],
        ["SECURITY DEFINER routines have a safe search path and are not executable by unprivileged roles."],
        ["Edge Function execution", "application-specific RPC authorization intent"],
    ),
] satisfies readonly PlatformVerificationSuiteDefinitionV1[]);

export async function identifyPlatformVerificationSuiteDefinition(
    definition: PlatformVerificationSuiteDefinitionV1,
): Promise<Readonly<{ definition: PlatformVerificationSuiteDefinitionV1; digest: string }>> {
    return Object.freeze({ definition, digest: await sha256Hex(canonicalJsonBytes(definition)) });
}

function suite(
    suiteId: string,
    applicability: PlatformVerificationSuiteDefinitionV1["applicability"],
    checks: readonly string[],
    claims: readonly string[],
    excludedClaims: readonly string[] = [],
): PlatformVerificationSuiteDefinitionV1 {
    return Object.freeze({
        schema: PLATFORM_VERIFICATION_SUITE_DEFINITION_SCHEMA,
        suiteId,
        applicability,
        checks: Object.freeze([...checks]),
        claims: Object.freeze([...claims]),
        excludedClaims: Object.freeze([...excludedClaims]),
    });
}
