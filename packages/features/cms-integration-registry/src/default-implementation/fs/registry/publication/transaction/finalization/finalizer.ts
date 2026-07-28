import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { identifyMigrationReport, identifyReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import { prepareFsIntegrationRegistryCandidate } from "../../candidate";
import { publishPreparedFsIntegrationRegistryCandidate } from "../../publisher";
import { activateVerifiedCandidate, recoverVerifiedCandidateActivations } from "./activation";
import { buildCandidateReleaseEvidence } from "./report";
import { buildCandidateMigrationReports } from "./migration";
import {
    FsIntegrationRegistryCandidateFinalizationError,
    type FinalizedIntegrationRegistryCandidate,
    type FsIntegrationRegistryCandidateFinalizerConfig,
} from "./types";
import { assertCandidateFinalizationInputs } from "./validation";

export class FsIntegrationRegistryCandidateFinalizer {
    readonly #activeCandidates = new Set<string>();

    constructor(private readonly config: FsIntegrationRegistryCandidateFinalizerConfig) {}

    async finalize(candidateId: string): Promise<FinalizedIntegrationRegistryCandidate> {
        if (this.#activeCandidates.has(candidateId)) {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "publication_recovery_required",
                "Candidate publication is already owned by another request",
            );
        }
        this.#activeCandidates.add(candidateId);
        try {
            return await this.#finalizeCandidate(candidateId);
        } finally {
            this.#activeCandidates.delete(candidateId);
        }
    }

    async recover(candidateId: string): Promise<FinalizedIntegrationRegistryCandidate> {
        return await this.finalize(candidateId);
    }

    async #finalizeCandidate(candidateId: string): Promise<FinalizedIntegrationRegistryCandidate> {
        let record = await this.config.candidates.get(candidateId);
        if (!record) {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "candidate_not_ready",
                `Candidate ${candidateId} does not exist`,
            );
        }
        if (record.status === "rejected") {
            return { ...identity(record), status: "rejected" };
        }
        if (record.status === "published") {
            return await this.#publishedResult(record);
        }
        if (record.status === "publishing") {
            await recoverVerifiedCandidateActivations(this.config);
            const recovered = await this.config.candidates.get(candidateId);
            if (recovered?.status === "published") {
                return await this.#publishedResult(recovered);
            }
            return await this.#finalize(recovered ?? record);
        }
        if (record.status !== "passed") {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "candidate_not_ready",
                `Candidate ${candidateId} is not ready for publication`,
            );
        }
        try {
            record = await this.config.candidates.beginPublication(candidateId, {
                expectedRevision: record.revision,
                now: now(this.config),
            });
            return await this.#finalize(record);
        } catch (error) {
            if (error instanceof FsIntegrationRegistryCandidateFinalizationError && error.code === "admission_stale") {
                const current = await this.config.candidates.get(candidateId);
                if (
                    current &&
                    (current.status === "passed" || current.status === "publishing") &&
                    !this.config.snapshots.current().locateExactVersion(current.kind, current.version)
                ) {
                    const occurredAt = now(this.config);
                    await this.config.candidates.rejectPublication(candidateId, {
                        expectedRevision: current.revision,
                        now: occurredAt,
                        failure: {
                            kind: "stale",
                            code: "admission_inputs_stale",
                            message: error.message,
                            occurredAt,
                        },
                    });
                    return { ...identity(current), status: "rejected" };
                }
            }
            throw error;
        }
    }

    async #finalize(
        record: NonNullable<Awaited<ReturnType<FsIntegrationRegistryCandidateFinalizerConfig["candidates"]["get"]>>>,
    ): Promise<FinalizedIntegrationRegistryCandidate> {
        const objects = await this.config.candidates.objects(record.candidateId);
        const location = this.config.snapshots.current().locateExactVersion(record.kind, record.version);
        await assertCandidateFinalizationInputs(
            this.config,
            record,
            objects,
            location ? "before-activation" : "before-publication",
        );
        if (
            !objects.policy ||
            !objects.admission ||
            !objects.compatibilityReport ||
            !objects.statefulChanges ||
            !objects.admissionJobResult
        ) {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "admission_stale",
                "Candidate immutable evidence is incomplete",
            );
        }
        const admissionJobResult = objects.admissionJobResult;
        const migrations = await buildCandidateMigrationReports({
            candidateId: record.candidateId,
            createdAt: record.updatedAt,
            compatibility: objects.compatibilityReport,
            policy: objects.policy,
            migrationInputs: objects.migrationInputs,
            result: admissionJobResult,
        });
        const evidence = await buildCandidateReleaseEvidence({
            candidateId: record.candidateId,
            candidateDigest: record.candidateDigest,
            createdAt: record.updatedAt,
            policy: objects.policy,
            admission: objects.admission,
            compatibility: objects.compatibilityReport,
            statefulChanges: objects.statefulChanges,
            result: admissionJobResult.verification,
            migrations,
            createDecisionId: this.config.createDecisionId ?? (() => `decision-${record.candidateDigest.slice(0, 32)}`),
        });
        if (!evidence.decision.admissible) {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "admission_rejected",
                `Candidate composite admission failed: ${evidence.decision.reasons.join(",")}`,
            );
        }
        await this.config.verificationBundles.put({
            envelope: objects.verification,
            canonicalBytes: canonicalJsonBytes(objects.verification),
            digest: record.verificationDigest,
        });
        if (!location) {
            const prepared = await prepareFsIntegrationRegistryCandidate(
                {
                    envelope: objects.package,
                    canonicalBytes: canonicalJsonBytes(objects.package),
                    digest: record.packageDigest,
                },
                this.config.packageLimits,
            );
            await publishPreparedFsIntegrationRegistryCandidate(
                this.config,
                prepared,
                "unverified",
                record.verificationDigest,
                async (capturedSnapshot) => {
                    const current = await this.config.candidates.get(record.candidateId);
                    if (current?.revision !== record.revision || current.status !== "publishing") {
                        throw new FsIntegrationRegistryCandidateFinalizationError(
                            "admission_stale",
                            "Candidate changed before the publication lock was acquired",
                        );
                    }
                    await assertCandidateFinalizationInputs(
                        this.config,
                        current,
                        objects,
                        "before-publication",
                        capturedSnapshot,
                    );
                },
            );
        }
        await assertCandidateFinalizationInputs(this.config, record, objects, "before-activation");
        const compatibility = await this.config.compatibilityReports.append({
            report: objects.compatibilityReport,
            expectedCurrent: null,
        });
        const verification = await this.config.verificationReports.append({
            report: evidence.verification,
            expectedCurrent: null,
        });
        for (const migration of migrations) {
            await identifyMigrationReport(migration);
            await this.config.migrationReports.append({ report: migration, expectedCurrent: null });
        }
        if (
            compatibility.currentRevisionId !== evidence.decision.compatibilityReport.revisionId ||
            compatibility.currentReportDigest !== evidence.decision.compatibilityReport.reportDigest ||
            verification.currentRevisionId !== evidence.decision.verificationReport?.revisionId ||
            verification.currentReportDigest !== evidence.decision.verificationReport.reportDigest
        ) {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "admission_stale",
                "Candidate release reports were concurrently substituted",
            );
        }
        const decisions = await this.config.releaseDecisions.append({
            report: evidence.decision,
            expectedCurrent: null,
        });
        const identifiedDecision = await identifyReleaseAdmissionDecision(decisions.current);
        await this.config.inheritedContracts?.register({
            kind: record.kind,
            version: record.version,
            packageDigest: record.packageDigest,
            verificationDigest: record.verificationDigest,
            verification: objects.verification,
            activeContracts: objects.admission.activeContracts,
            createdAt: record.updatedAt,
            provenance: {
                candidateId: record.candidateId,
                decisionRevisionId: decisions.currentRevisionId,
                decisionDigest: identifiedDecision.digest,
            },
        });
        await assertCandidateFinalizationInputs(this.config, record, objects, "before-activation");
        const published = await activateVerifiedCandidate(this.config, record, {
            revisionId: decisions.currentRevisionId,
            digest: identifiedDecision.digest,
        });
        return {
            ...identity(published),
            status: "published",
            decisionRevisionId: decisions.currentRevisionId,
            decisionDigest: identifiedDecision.digest,
        };
    }

    async #publishedResult(
        record: NonNullable<Awaited<ReturnType<FsIntegrationRegistryCandidateFinalizerConfig["candidates"]["get"]>>>,
    ): Promise<FinalizedIntegrationRegistryCandidate> {
        const decisions = await this.config.releaseDecisions.get(record.kind, record.version);
        if (!decisions || !decisions.current.admissible || decisions.current.packageDigest !== record.packageDigest) {
            throw new FsIntegrationRegistryCandidateFinalizationError(
                "publication_recovery_required",
                "Published candidate has no exact current admissible decision",
            );
        }
        return {
            ...identity(record),
            status: "published" as const,
            decisionRevisionId: decisions.currentRevisionId,
            decisionDigest: decisions.currentReportDigest,
        };
    }
}

function identity(
    record: Readonly<{
        candidateId: string;
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
    }>,
) {
    return {
        candidateId: record.candidateId,
        kind: record.kind,
        version: record.version,
        packageDigest: record.packageDigest,
        verificationDigest: record.verificationDigest,
    };
}

function now(config: FsIntegrationRegistryCandidateFinalizerConfig): string {
    return config.now?.() ?? new Date().toISOString();
}
