export {
    ADMISSION_INPUT_SNAPSHOT_SCHEMA,
    INTEGRATION_VERIFICATION_SCHEMA,
    RELEASE_ADMISSION_POLICY_SNAPSHOT_SCHEMA,
    VERIFICATION_JOB_RESULT_SCHEMA,
    type AdmissionActiveContractReferenceV1,
    type AdmissionDependencyReferenceV1,
    type AdmissionInputSnapshotV1,
    type AdmissionReviewedBaselineReferenceV1,
    type AdmissionSuitePlanEntryV1,
    type IdentifiedAdmissionInputSnapshotV1,
    type IdentifiedReleaseAdmissionPolicySnapshotV1,
    type IdentifiedVerificationJobResultV1,
    type IntegrationVerificationEnvelopeV1,
    type IntegrationVerificationManifestV1,
    type IntegrationVerificationValidationOptions,
    type MigrationEvidencePolicyV1,
    type PlatformRequiredVerificationSuiteV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type VerificationCachePolicyV1,
    type VerificationJobAttemptIdentityV1,
    type VerificationJobResultV1,
    type VerificationJobSuiteResultV1,
    type VerificationRetryPolicyV1,
} from "../interfaces/verification";
export {
    INTEGRATION_CANDIDATE_SCHEMA,
    type IntegrationCandidateEnvelopeV1,
    type ValidatedIntegrationCandidateEnvelopeV1,
} from "../interfaces/candidate";
export {
    FINDING_RESOLUTION_PROOF_SCHEMA,
    type CompatibilityFinding,
    type CompatibilityFindingClassification,
    type CompatibilityFindingResolutionResult,
    type CompatibilityFindingIdentityInput,
    type CompatibilityFindingInput,
    type CompatibilityFindingSurface,
    type FindingResolutionProof,
    type FindingResolutionPolicyRule,
    type ResolvedCompatibilityFinding,
} from "../interfaces/finding";
export {
    REVIEWED_SCHEMA_BASELINE_SCHEMA,
    type ReviewedSchemaBaselineV1,
} from "../interfaces/baseline";
export type {
    PinnedVerificationRunnerIdentity,
    VerificationPolicyIdentity,
    VerificationRunnerRequirement,
} from "../interfaces/runner";
export {
    COMPATIBILITY_REPORT_V2_SCHEMA,
    MIGRATION_REPORT_SCHEMA,
    RELEASE_ADMISSION_DECISION_SCHEMA,
    VERIFICATION_REPORT_SCHEMA,
    type CompatibilityNoBaselineReason,
    type CompatibilityReleaseLevel,
    type CompatibilityReportAssessment,
    type CompatibilityReportOutcome,
    type CompatibilityReportV2,
    type CompatibilityRequiredReleaseLevel,
    type ComposeReleaseAdmissionDecisionInput,
    type DigestContractReference,
    type MigrationCheckResult,
    type MigrationReport,
    type ReleaseAdmissionDecision,
    type RequiredMigrationEvidence,
    type ReportHistoryFields,
    type ReportOrigin,
    type ReportProvenance,
    type VerificationReport,
    type VerificationSuiteResult,
    type VersionDigestReference,
} from "../interfaces/reports";
export {
    assertVerificationJobResultReplay,
    computeIntegrationVerificationDigest,
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
    identifyVerificationJobResult,
    parseAdmissionInputSnapshot,
    parseIntegrationVerificationEnvelope,
    parseReleaseAdmissionPolicySnapshot,
    parseVerificationJobResult,
    validateAdmissionInputSnapshot,
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationVerificationEnvelope,
    validateReleaseAdmissionPolicySnapshot,
    validateVerificationJobResult,
    validateVerificationJobResultForAdmission,
} from "../core/verification";
export {
    parseIntegrationCandidateEnvelope,
    validateIntegrationCandidateEnvelope,
} from "../core/candidate";
export {
    computeCompatibilityFindingId,
    createCompatibilityFinding,
    findingResolutionProofAppliesToPolicy,
    parseCompatibilityFinding,
    parseFindingResolutionProof,
} from "../core/finding";
export { resolveCompatibilityFindings } from "../core/findingResolution";
export { identifyReviewedSchemaBaseline, parseReviewedSchemaBaseline } from "../core/baseline";
export {
    parsePinnedVerificationRunnerIdentity,
    parseVerificationPolicyIdentity,
    parseVerificationRunnerRequirement,
    runnerSatisfiesRequirement,
} from "../core/runner";
export { parseCompatibilityReportV2 } from "../core/reports/compatibility";
export { deriveCompatibilityReportAssessment } from "../core/reports/compatibilityAssessment";
export { parseVerificationReport } from "../core/reports/verification";
export { parseMigrationReport } from "../core/reports/migration";
export {
    appendReleaseAdmissionDecision,
    assertReleaseAdmissionDecisionHistory,
    parseReleaseAdmissionDecision,
} from "../core/reports/decision";
export { composeReleaseAdmissionDecision } from "../core/reports/decisionComposition";
export { assertReportRevisionFollows } from "../core/reports/shared";
export {
    IntegrationVerificationContractError,
    type IntegrationVerificationContractErrorCode,
} from "../core/validation/errors";
