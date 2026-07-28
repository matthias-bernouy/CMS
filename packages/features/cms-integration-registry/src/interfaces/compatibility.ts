import type {
    DeclarativeConnectorSchemaContract,
    IntegrationDefinition,
    IntegrationVersionReleaseLevel,
} from "@bernouy/cms-integrations";

export type IntegrationCompatibilityOutcome = "compatible" | "breaking" | "unknown" | "invalid" | "not-applicable";
export type IntegrationCompatibilityEvidenceClassification =
    | "compatible"
    | "additive"
    | "breaking"
    | "unknown"
    | "invalid";
export type IntegrationCompatibilityReleaseLevel = "initial" | IntegrationVersionReleaseLevel;
export type IntegrationCompatibilityNoBaselineReason = "new-kind" | "new-major";

export type IntegrationCompatibilityEvidence = Readonly<{
    classification: IntegrationCompatibilityEvidenceClassification;
    surface: "definition" | "input" | "dependency" | "artifact" | "schema" | "function";
    code: string;
    path: string;
    message: string;
}>;

export type IntegrationCompatibilityBaselineReference = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type IntegrationCompatibilityEvaluatorIdentity = Readonly<{
    name: string;
    version: string;
}>;

export type ReviewedConnectorSchemaBaseline = Readonly<{
    connector: Readonly<{ provider: string; root?: string }>;
    packageDigest: string;
    dependencies: readonly Readonly<{ kind: string; version: string; packageDigest: string }>[];
    schema: DeclarativeConnectorSchemaContract;
    provenance: Readonly<{
        evidenceId: string;
        source: string;
        reviewedAt: string;
    }>;
}>;

export type TrustedSchemaDeclarationEvidence = Readonly<{
    evidenceId: string;
    packageDigest: string;
    connector: Readonly<{ provider: string; root?: string }>;
    producer: IntegrationCompatibilityEvaluatorIdentity;
    createdAt: string;
    verdict: "consistent" | "contradiction";
    message?: string;
}>;

export type IntegrationCompatibilityPackage = Readonly<{
    definition: IntegrationDefinition;
    packageDigest: string;
    reviewedSchemaBaselines?: readonly ReviewedConnectorSchemaBaseline[];
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[];
}>;

type IntegrationCompatibilityEvaluationBase = Readonly<{
    candidate: IntegrationCompatibilityPackage;
    changedPaths?: readonly string[];
}>;

export type IntegrationCompatibilityEvaluationInput = IntegrationCompatibilityEvaluationBase &
    (
        | Readonly<{
              baseline: IntegrationCompatibilityPackage;
              noBaselineReason?: never;
              informationalBaseline?: never;
          }>
        | Readonly<{
              baseline?: never;
              noBaselineReason: "new-kind";
              informationalBaseline?: never;
          }>
        | Readonly<{
              baseline?: never;
              noBaselineReason: "new-major";
              informationalBaseline?: IntegrationCompatibilityPackage;
          }>
    );

export type IntegrationCompatibilityEvaluatorOptions = Readonly<{
    identity: IntegrationCompatibilityEvaluatorIdentity;
    now: () => string;
    createReportId: () => string;
}>;

export type IntegrationCompatibilityEvaluation = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    baselines: readonly IntegrationCompatibilityBaselineReference[];
    informationalBaselines: readonly IntegrationCompatibilityBaselineReference[];
    evidence: readonly IntegrationCompatibilityEvidence[];
    outcome: IntegrationCompatibilityOutcome;
    requiredReleaseLevel: IntegrationVersionReleaseLevel | "none";
    releaseLevel: IntegrationCompatibilityReleaseLevel;
    contractAdmissible: boolean;
    noBaselineReason?: IntegrationCompatibilityNoBaselineReason;
}>;
