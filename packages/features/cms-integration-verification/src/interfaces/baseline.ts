import type { ObservedSchemaContractV1 } from "@bernouy/cms-integrations";
import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "./runner";
import type { ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./reports/common";

export const REVIEWED_SCHEMA_BASELINE_SCHEMA = "cms.integration.reviewed-schema-baseline.v1" as const;

export type ReviewedSchemaBaselineV1 = ReportHistoryFields &
    Readonly<{
        schema: typeof REVIEWED_SCHEMA_BASELINE_SCHEMA;
        kind: string;
        version: string;
        packageDigest: string;
        connectorKey: string;
        lineageId: string;
        legacySelector: Readonly<{
            provider: string;
            root?: string;
        }>;
        dependencies: readonly VersionDigestReference[];
        observedSchema: ObservedSchemaContractV1;
        observedSchemaDigest: string;
        generator: PinnedVerificationRunnerIdentity;
        environment: Readonly<{
            digest: string;
            postgresVersion: string;
        }>;
        policy: VerificationPolicyIdentity;
        generatedAt: string;
        provenance: ReportProvenance;
    }>;
