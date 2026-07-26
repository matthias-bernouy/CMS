import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionPolicySnapshot,
    identifyStatefulChangeSelection,
    identifyVerificationJobResult,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import type {
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import type { FsIntegrationRegistryCandidateFinalizerConfig } from "./types";
import { FsIntegrationRegistryCandidateFinalizationError } from "./types";
import { identifyCatalogRevision } from "../planning/catalog";

export async function assertCandidateFinalizationInputs(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    record: IntegrationRegistryCandidateRecord,
    objects: IntegrationRegistryCandidateObjects,
    phase: "before-publication" | "before-activation",
    snapshot: IntegrationRegistryCatalogSnapshot = config.snapshots.current(),
): Promise<void> {
    const { policy, admission, compatibilityReport, statefulChanges, verificationJobResult } = objects;
    if (!policy || !admission || !compatibilityReport || !statefulChanges || !verificationJobResult) {
        stale("Candidate is missing immutable admission planning or verification objects");
    }
    const identifiedPolicy = await identifyReleaseAdmissionPolicySnapshot(policy);
    const currentPolicy = await identifyReleaseAdmissionPolicySnapshot(config.policy);
    const identifiedAdmission = await identifyAdmissionInputSnapshot(admission);
    const compatibility = await identifyCompatibilityReportV2(compatibilityReport);
    const stateful = await identifyStatefulChangeSelection(statefulChanges);
    const result = await identifyVerificationJobResult(verificationJobResult);
    if (
        identifiedPolicy.digest !== currentPolicy.digest ||
        identifiedPolicy.digest !== record.policyDigest ||
        identifiedAdmission.digest !== record.admissionInputDigest ||
        compatibility.digest !== record.compatibilityReportDigest ||
        stateful.digest !== record.statefulChangeSelectionDigest ||
        result.digest !== record.verificationJobResultDigest ||
        identifiedAdmission.snapshot.compatibilityRevision.digest !== compatibility.digest ||
        identifiedAdmission.snapshot.compatibilityRevision.revisionId !== compatibility.report.reportId ||
        stateful.selection.compatibilityReport.reportDigest !== compatibility.digest ||
        stateful.selection.policySnapshotDigest !== identifiedPolicy.digest
    ) {
        stale("Candidate admission object digests or policy changed before finalization");
    }
    const location = snapshot.locateExactVersion(record.kind, record.version);
    if (phase === "before-publication") {
        if (location) {
            stale("Candidate version already exists before its exact publication");
        }
        const catalog = await identifyCatalogRevision(snapshot);
        if (catalog.digest !== identifiedAdmission.snapshot.catalogRevision.digest) {
            stale("Catalog changed after candidate verification");
        }
    } else {
        const entry = snapshot.getIndex(record.kind)?.versions.find((version) => version.version === record.version);
        if (
            !location ||
            location.package.digest !== record.packageDigest ||
            entry?.status !== "unverified" ||
            entry.verificationDigest !== record.verificationDigest
        ) {
            stale("Published candidate package is absent, substituted, or already eligibility-mutated");
        }
    }
    await assertDependencies(snapshot, identifiedAdmission.snapshot.dependencies);
    await assertReviewedBaselines(config, identifiedAdmission.snapshot.reviewedBaselines);
    await assertInheritedContracts(config, record, objects);
}

async function assertDependencies(
    snapshot: IntegrationRegistryCatalogSnapshot,
    dependencies: NonNullable<IntegrationRegistryCandidateObjects["admission"]>["dependencies"],
): Promise<void> {
    for (const dependency of dependencies) {
        const location = snapshot.locateExactVersion(dependency.kind, dependency.version);
        const entry = snapshot
            .getIndex(dependency.kind)
            ?.versions.find((version: Readonly<{ version: string }>) => version.version === dependency.version);
        if (!location || location.package.digest !== dependency.packageDigest || entry?.status !== undefined) {
            stale(`Pinned dependency ${dependency.kind}@${dependency.version} is no longer installable`);
        }
    }
}

async function assertReviewedBaselines(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    references: NonNullable<IntegrationRegistryCandidateObjects["admission"]>["reviewedBaselines"],
): Promise<void> {
    for (const reference of references) {
        const history = await config.reviewedSchemaBaselines.get({
            kind: reference.kind,
            version: reference.version,
            packageDigest: reference.packageDigest,
            connectorKey: reference.connectorKey,
            lineageId: reference.lineageId,
        });
        if (
            !history ||
            history.currentRevisionId !== reference.revisionId ||
            history.currentBaselineDigest !== reference.baselineDigest ||
            history.current.observedSchemaDigest !== reference.observedSchemaDigest
        ) {
            stale(`Reviewed schema baseline changed for ${reference.kind}@${reference.version}`);
        }
    }
}

async function assertInheritedContracts(
    config: FsIntegrationRegistryCandidateFinalizerConfig,
    record: IntegrationRegistryCandidateRecord,
    objects: IntegrationRegistryCandidateObjects,
): Promise<void> {
    if (!config.inheritedContracts || !objects.admission) {
        return;
    }
    const current = await config.inheritedContracts.listActive(record.kind, record.version);
    const ownIds = new Set(objects.verification.manifest.contracts.map((contract) => contract.contractId));
    const expected = objects.admission.activeContracts
        .filter((contract) => !ownIds.has(contract.contractId))
        .map((contract) => ({
            contractId: contract.contractId,
            ownerVersion: contract.ownerVersion,
            digest: contract.contractDigest,
        }));
    const actual = current.map(({ reference }) => ({
        contractId: reference.contractId,
        ownerVersion: reference.ownerVersion,
        digest: reference.contractDigest,
    }));
    if (!sameCanonical(expected, actual)) {
        stale("Inherited verification contract set changed after candidate verification");
    }
}

function sameCanonical(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function stale(message: string): never {
    throw new FsIntegrationRegistryCandidateFinalizationError("admission_stale", message);
}
