import type { PreparedOfficialVerificationBackfill } from "@bernouy/cms-integration-registry";
import {
    buildOfficialRepositoryBootstrapPlan,
    type OfficialRepositoryBootstrapEvidenceV1,
} from "@bernouy/cms-official-integrations/publication";

export const PACKAGE_DIGEST = "a".repeat(64);
export const OBSERVED_SCHEMA_DIGEST = "b".repeat(64);

export type OfficialBaseline = OfficialRepositoryBootstrapEvidenceV1["reviewedSchemaBaselines"][number];

let officialPlan: ReturnType<typeof buildOfficialRepositoryBootstrapPlan> | undefined;

export async function officialVerificationBackfills(): Promise<readonly PreparedOfficialVerificationBackfill[]> {
    officialPlan ??= buildOfficialRepositoryBootstrapPlan();
    return (await officialPlan).verificationBackfills;
}

export function officialBaseline(kind = "demo"): OfficialBaseline {
    return {
        schema: "cms.integration.reviewed-schema-baseline.v1",
        reportId: `official-schema-baseline/${kind}/1.0.0/primary/v1`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: "2026-07-26T00:00:00.000Z",
        kind,
        version: "1.0.0",
        packageDigest: PACKAGE_DIGEST,
        connectorKey: "primary",
        lineageId: `${kind}-supabase-v1`,
        legacySelector: { provider: "supabase", root: "connectors/supabase" },
        dependencies: [],
        observedSchema: {
            schema: "cms.integration.observed-schema.v1",
            owner: { connectorKey: "primary", lineageId: `${kind}-supabase-v1` },
            namespaces: [],
        },
        observedSchemaDigest: OBSERVED_SCHEMA_DIGEST,
        generator: { name: "cms-schema-generator", version: "1.0.0", imageDigest: `sha256:${"c".repeat(64)}` },
        environment: { digest: "d".repeat(64), postgresVersion: "160014" },
        policy: { name: "legacy-schema-baseline", version: "1.0.0" },
        generatedAt: "2026-07-26T00:00:00.000Z",
        provenance: { actor: "official-integrations-ci", reason: "Reviewed calibration" },
    };
}
