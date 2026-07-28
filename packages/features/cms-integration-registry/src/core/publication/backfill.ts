import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    assertReleaseAdmissionDecisionMatchesReports,
    computeIntegrationVerificationDigest,
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionDecision,
    identifyStatefulChangeSelection,
    identifyVerificationReport,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import {
    INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
    type IdentifiedIntegrationVerificationBackfillRequest,
    type IntegrationVerificationBackfillRequest,
} from "../../interfaces/publication";

export type IntegrationVerificationBackfillErrorCode =
    | "verification_backfill_invalid"
    | "verification_backfill_not_found"
    | "verification_backfill_conflict"
    | "verification_backfill_unapproved"
    | "verification_backfill_partial"
    | "verification_backfill_recovery_required";

export class IntegrationVerificationBackfillError extends Error {
    constructor(
        readonly status: 400 | 404 | 409 | 422 | 503,
        readonly code: IntegrationVerificationBackfillErrorCode,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "IntegrationVerificationBackfillError";
    }
}

export async function identifyIntegrationVerificationBackfillRequest(
    value: unknown,
): Promise<IdentifiedIntegrationVerificationBackfillRequest> {
    try {
        return await identify(value);
    } catch (error) {
        if (error instanceof IntegrationVerificationBackfillError) {
            throw error;
        }
        throw new IntegrationVerificationBackfillError(
            400,
            "verification_backfill_invalid",
            "Integration verification backfill request is invalid",
            { cause: error },
        );
    }
}

async function identify(value: unknown): Promise<IdentifiedIntegrationVerificationBackfillRequest> {
    if (
        !hasExactKeys(value, [
            "compatibilityReport",
            "decision",
            "schema",
            "statefulChanges",
            "verification",
            "verificationReport",
        ]) ||
        value.schema !== INTEGRATION_VERIFICATION_BACKFILL_SCHEMA ||
        !hasExactKeys(value.verification, ["digest", "envelope"]) ||
        typeof value.verification.digest !== "string" ||
        !/^[a-f0-9]{64}$/u.test(value.verification.digest)
    ) {
        throw new TypeError("Verification backfill request has an invalid closed schema");
    }
    const envelope = validateIntegrationVerificationEnvelope(value.verification.envelope);
    const verificationDigest = await computeIntegrationVerificationDigest(envelope);
    if (verificationDigest !== value.verification.digest) {
        throw new TypeError("Verification backfill bundle digest is inconsistent");
    }
    const compatibility = await identifyCompatibilityReportV2(value.compatibilityReport);
    const verification = await identifyVerificationReport(value.verificationReport);
    const statefulChanges = await identifyStatefulChangeSelection(value.statefulChanges);
    const decision = await identifyReleaseAdmissionDecision(value.decision);
    await assertReleaseAdmissionDecisionMatchesReports(decision.decision, {
        compatibility: compatibility.report,
        verification: verification.report,
        migrations: [],
    });
    const target = envelope.target;
    if (
        compatibility.report.kind !== target.kind ||
        compatibility.report.version !== target.version ||
        compatibility.report.packageDigest !== target.packageDigest ||
        compatibility.report.origin !== "legacy-backfill" ||
        compatibility.report.revisionType !== "root" ||
        verification.report.kind !== target.kind ||
        verification.report.version !== target.version ||
        verification.report.packageDigest !== target.packageDigest ||
        verification.report.verificationDigest !== verificationDigest ||
        verification.report.origin !== "legacy-backfill" ||
        verification.report.revisionType !== "root" ||
        statefulChanges.selection.target.kind !== target.kind ||
        statefulChanges.selection.target.version !== target.version ||
        statefulChanges.selection.target.packageDigest !== target.packageDigest ||
        decision.decision.kind !== target.kind ||
        decision.decision.version !== target.version ||
        decision.decision.packageDigest !== target.packageDigest ||
        decision.decision.revisionType !== "root" ||
        !decision.decision.admissible ||
        decision.decision.migrationReports.length !== 0 ||
        statefulChanges.selection.requiredMigrations.length !== 0
    ) {
        throw new TypeError("Verification backfill evidence is not one exact legacy root set");
    }
    const request: IntegrationVerificationBackfillRequest = {
        schema: INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
        verification: { digest: verificationDigest, envelope },
        compatibilityReport: compatibility.report,
        verificationReport: verification.report,
        statefulChanges: statefulChanges.selection,
        decision: decision.decision,
    };
    const canonicalBytes = canonicalJsonBytes(request);
    return {
        request,
        canonicalBytes,
        digest: await sha256Hex(canonicalBytes),
        compatibilityReportDigest: compatibility.digest,
        verificationReportDigest: verification.digest,
        decisionDigest: decision.digest,
    };
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}
