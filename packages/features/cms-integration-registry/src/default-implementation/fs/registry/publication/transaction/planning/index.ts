import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import { prepareFsIntegrationRegistryCandidate } from "../../candidate";
import { nextIntegrationRegistryIndex } from "../../index";
import { CapturedReviewedSchemaBaselineStore } from "./baselines";
import { identifyCatalogRevision } from "./catalog";
import { planCandidateCompatibility } from "./compatibility";
import { resolveCandidateDependencies } from "./dependencies";
import { buildMigrationVerificationInputs, selectStatefulChanges } from "./stateful";
import { planCandidateBehavioralRls, selectCandidateSuites } from "./suites";
import {
    FsIntegrationRegistryCandidateAdmissionPlanningError,
    type FsIntegrationRegistryCandidateAdmissionPlan,
    type FsIntegrationRegistryCandidateAdmissionPlannerConfig,
    type PlanFsIntegrationRegistryCandidateInput,
} from "./types";

export class FsIntegrationRegistryCandidateAdmissionPlanner {
    constructor(private readonly config: FsIntegrationRegistryCandidateAdmissionPlannerConfig) {}

    async plan(input: PlanFsIntegrationRegistryCandidateInput): Promise<FsIntegrationRegistryCandidateAdmissionPlan> {
        return await this.config.mutations.runExclusive(input.candidate.envelope.package.kind, async () =>
            this.#planExclusive(input),
        );
    }

    async #planExclusive(
        input: PlanFsIntegrationRegistryCandidateInput,
    ): Promise<FsIntegrationRegistryCandidateAdmissionPlan> {
        const record = await this.#requireValidatingCandidate(input);
        const snapshot = this.config.snapshots.current();
        const catalog = await identifyCatalogRevision(snapshot);
        const policy = await identifyReleaseAdmissionPolicySnapshot(this.config.policy);
        const prepared = await prepareFsIntegrationRegistryCandidate(
            {
                envelope: input.candidate.envelope.package,
                canonicalBytes: canonicalJsonBytes(input.candidate.envelope.package),
                digest: input.candidate.packageDigest,
            },
            this.config.limits,
        );
        nextIntegrationRegistryIndex(
            snapshot.getIndex(prepared.definition.kind),
            prepared.definition,
            prepared.package.envelope,
            {
                status: "unverified",
                advanceChannels: false,
            },
        );
        const reviewed = new CapturedReviewedSchemaBaselineStore(this.config.reviewedSchemaBaselines);
        const compatibility = await planCandidateCompatibility({
            snapshot,
            catalog,
            candidate: prepared,
            candidateDigest: record.candidateDigest,
            createdAt: record.updatedAt,
            policy: policy.snapshot,
            baselines: reviewed,
        });
        const dependencies = resolveCandidateDependencies(snapshot, prepared.definition);
        const suites = await selectCandidateSuites({
            kind: record.kind,
            version: record.version,
            verification: input.candidate.envelope.verification,
            policy: policy.snapshot,
            definition: prepared.definition,
            inherited: this.config.inheritedContracts,
        });
        const stateful = await selectStatefulChanges({
            snapshot,
            report: compatibility.report,
            reportDigest: compatibility.reportDigest,
            policy: policy.snapshot,
            policyDigest: policy.digest,
            baselines: reviewed,
        });
        const migrationInputs = await buildMigrationVerificationInputs({
            snapshot,
            targetDefinition: prepared.definition,
            dependencies,
            selection: stateful.selection,
            selectionDigest: stateful.digest,
            policy: policy.snapshot,
            policyDigest: policy.digest,
            environment: this.config.migrationEnvironment,
        });
        const candidateIdentity = {
            kind: record.kind,
            version: record.version,
            candidateDigest: record.candidateDigest,
            packageDigest: record.packageDigest,
            verificationDigest: record.verificationDigest,
        };
        const behavioralRlsPlan = await planCandidateBehavioralRls(
            suites,
            input.candidate.envelope.verification,
            candidateIdentity,
            policy.digest,
        );
        const admission = await identifyAdmissionInputSnapshot({
            schema: "cms.integration.admission-input.v1",
            candidate: {
                candidateId: record.candidateId,
                ...candidateIdentity,
            },
            policyDigest: policy.digest,
            selectedRunner: suites.runner,
            reviewedBaselines: reviewed.references(),
            dependencies,
            activeContracts: suites.activeContracts,
            suites: suites.suites,
            ...(behavioralRlsPlan
                ? { behavioralRlsPlan: { digest: behavioralRlsPlan.digest, plan: behavioralRlsPlan.plan } }
                : {}),
            catalogRevision: catalog,
            compatibilityRevision: {
                revisionId: compatibility.report.reportId,
                digest: compatibility.reportDigest,
                evaluatorInputDigest: compatibility.evaluatorInputDigest,
            },
        });
        await reviewed.assertStillCurrent();
        await this.#assertCatalogStillCurrent(catalog.digest);
        await this.#requireValidatingCandidate(input, record.revision);
        const persisted = await this.config.candidates.persistPlanningArtifacts(record.candidateId, {
            expectedRevision: record.revision,
            compatibilityReport: compatibility.report,
            compatibilityEvaluatorInputDigest: compatibility.evaluatorInputDigest,
            statefulChanges: stateful.selection,
        });
        return Object.freeze({
            policy: policy.snapshot,
            admission: admission.snapshot,
            compatibilityReportDigest: persisted.compatibilityReportDigest,
            statefulChangeSelectionDigest: persisted.statefulChangeSelectionDigest,
            statefulChanges: stateful.selection,
            migrationInputs,
        });
    }

    async #requireValidatingCandidate(input: PlanFsIntegrationRegistryCandidateInput, revision?: number) {
        const record = await this.config.candidates.get(input.candidateId);
        if (
            !record ||
            record.status !== "validating" ||
            (revision !== undefined && record.revision !== revision) ||
            record.candidateDigest !== input.candidate.candidateDigest ||
            record.packageDigest !== input.candidate.packageDigest ||
            record.verificationDigest !== input.candidate.verificationDigest
        ) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "candidate_not_validating",
                `Candidate ${input.candidateId} is not the expected validating revision`,
            );
        }
        return record;
    }

    async #assertCatalogStillCurrent(expectedDigest: string): Promise<void> {
        const current = await identifyCatalogRevision(this.config.snapshots.current());
        if (current.digest !== expectedDigest) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "catalog_changed",
                "Catalog changed while candidate admission inputs were being planned",
            );
        }
    }
}

export {
    FsIntegrationRegistryCandidateAdmissionPlanningError,
    type CandidateAdmissionPlanningErrorCode,
    type FsIntegrationRegistryCandidateAdmissionPlan,
    type FsIntegrationRegistryCandidateAdmissionPlannerConfig,
    type InheritedVerificationContract,
    type IntegrationVerificationContractCatalog,
    type PlanFsIntegrationRegistryCandidateInput,
} from "./types";
