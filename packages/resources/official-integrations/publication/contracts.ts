import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type {
    OfficialBootstrapAnonymousConstraintGrandfathering,
    OfficialRepositoryBootstrapBaselineApproval,
} from "@bernouy/cms-integration-registry";
import type { ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export const OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH = ".registry/official-bootstrap-evidence.v1.json";

export const OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE =
    "oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0";
export const OFFICIAL_SCHEMA_BASELINE_GENERATOR = Object.freeze({
    name: "cms-schema-generator",
    version: "1.0.0",
    imageDigest: OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE.slice(
        OFFICIAL_SCHEMA_BASELINE_GENERATOR_IMAGE.indexOf("@") + 1,
    ),
});
export const OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST =
    "2484fadd22636f1a7183b21b14177b180b9e0c350a93c641ad2d772483e409c3";
export const OFFICIAL_SCHEMA_BASELINE_POSTGRES_VERSION = "160014";
export const OFFICIAL_SCHEMA_BASELINE_POLICY = Object.freeze({
    name: "legacy-schema-baseline",
    version: "1.0.0",
});
export const OFFICIAL_SCHEMA_BASELINE_PROVENANCE_ACTOR = "official-integrations-ci";
export const OFFICIAL_SCHEMA_BASELINE_GENERATED_AT = "2026-07-26T00:00:00.000Z";

export const OFFICIAL_REPOSITORY_SQL_BASELINE_TARGETS = Object.freeze([
    { kind: "commerce", version: "1.0.0", connectorKey: "primary", lineageId: "commerce-supabase-v1" },
    { kind: "newsletter", version: "1.0.0", connectorKey: "primary", lineageId: "newsletter-supabase-v1" },
    { kind: "photo-albums", version: "1.0.0", connectorKey: "primary", lineageId: "photo-albums-supabase-v1" },
    {
        kind: "sales-configurator",
        version: "1.0.0",
        connectorKey: "primary",
        lineageId: "sales-configurator-supabase-v1",
    },
    { kind: "user-account", version: "1.0.0", connectorKey: "primary", lineageId: "user-account-supabase-v1" },
    {
        kind: "commerce-negotiation",
        version: "1.0.0",
        connectorKey: "primary",
        lineageId: "commerce-negotiation-supabase-v1",
    },
    { kind: "emailer", version: "1.0.0", connectorKey: "primary", lineageId: "emailer-supabase-v1" },
    { kind: "mondial-relay", version: "1.0.0", connectorKey: "primary", lineageId: "mondial-relay-supabase-v1" },
    { kind: "stripe-connect", version: "1.0.0", connectorKey: "primary", lineageId: "stripe-connect-supabase-v1" },
] as const);

export const OFFICIAL_REPOSITORY_BOOTSTRAP_BASELINE_APPROVAL: OfficialRepositoryBootstrapBaselineApproval =
    Object.freeze({
        generator: OFFICIAL_SCHEMA_BASELINE_GENERATOR,
        environmentDigests: [OFFICIAL_SCHEMA_BASELINE_ENVIRONMENT_DIGEST],
        policy: OFFICIAL_SCHEMA_BASELINE_POLICY,
        provenanceActors: [OFFICIAL_SCHEMA_BASELINE_PROVENANCE_ACTOR],
    });

export type OfficialIntegrationPackage = Readonly<{
    kind: string;
    version: string;
    digest: string;
    canonicalBytes: Uint8Array;
}>;

export type BuiltOfficialIntegrationPackage = OfficialIntegrationPackage &
    Readonly<{ package: ResolvedIntegrationPackage; definition: IntegrationDefinition }>;

export type OfficialRepositoryBootstrapEvidenceV1 = Readonly<{
    schema: "cms.integration.official-bootstrap-evidence.v1";
    reviewedSchemaBaselines: readonly ReviewedSchemaBaselineV1[];
    anonymousConstraintGrandfathering: readonly OfficialBootstrapAnonymousConstraintGrandfathering[];
}>;
