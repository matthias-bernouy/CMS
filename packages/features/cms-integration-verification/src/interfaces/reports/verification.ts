import type { PinnedVerificationRunnerIdentity, VerificationPolicyIdentity } from "../runner";
import type { DigestContractReference, ReportHistoryFields, ReportProvenance, VersionDigestReference } from "./common";

export const VERIFICATION_REPORT_SCHEMA = "cms.integration.verification-report.v1" as const;

export type VerificationSuiteResult = Readonly<{
    suiteId: string;
    source: "platform" | "author-contract" | "author-conformance";
    required: boolean;
    outcome: "passed" | "failed" | "skipped" | "infrastructure-failure";
    durationMs: number;
    attempts: number;
    cacheHit: boolean;
    diagnostic?: Readonly<{
        code: string;
        message: string;
        redacted: true;
    }>;
}>;

export type VerificationReport = ReportHistoryFields &
    Readonly<{
        schema: typeof VERIFICATION_REPORT_SCHEMA;
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
        runner: PinnedVerificationRunnerIdentity;
        policy: VerificationPolicyIdentity;
        dependencies: readonly VersionDigestReference[];
        baselines: readonly VersionDigestReference[];
        activeContracts: readonly DigestContractReference[];
        environment: Readonly<{
            digest: string;
            versions: Readonly<Record<string, string>>;
        }>;
        results: readonly VerificationSuiteResult[];
        outcome: "passed" | "failed" | "infrastructure-failure";
        provenance: ReportProvenance;
    }>;
