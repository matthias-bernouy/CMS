import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { integrationVersionsShareMajor } from "@bernouy/cms-integrations";
import {
    assertIntegrationCompatibilityAdmission,
    IntegrationCompatibilityEvaluator,
} from "../../../../core/compatibility/evaluation";
import { changedIntegrationPackagePaths } from "../../../../core/publication/changedPaths";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../interfaces/catalog";
import type {
    IntegrationCompatibilityAdmissionReport,
    IntegrationCompatibilityAdmissionDecision,
    IntegrationCompatibilityEvaluationInput,
    IntegrationCompatibilityPackage,
    TrustedSchemaDeclarationEvidence,
} from "../../../../interfaces/compatibility";
import type { ReviewedSchemaBaselineStore } from "../../../../interfaces/reportStore";
import { loadReviewedConnectorSchemaBaselines } from "../baselines/projection";
import type { PreparedFsIntegrationRegistryCandidate } from "./candidate";
import { SnapshotIntegrationPackageSource } from "../../snapshot/snapshotPackageSource";

export async function evaluatePublicationCompatibility(
    snapshot: IntegrationRegistryCatalogSnapshot,
    candidate: PreparedFsIntegrationRegistryCandidate,
    evaluator: IntegrationCompatibilityEvaluator,
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[],
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore,
): Promise<IntegrationCompatibilityAdmissionReport> {
    return assertIntegrationCompatibilityAdmission(
        await evaluatePublicationCompatibilityDecision(
            snapshot,
            candidate,
            evaluator,
            schemaDeclarationEvidence,
            reviewedSchemaBaselines,
        ),
    );
}

export async function evaluatePublicationCompatibilityDecision(
    snapshot: IntegrationRegistryCatalogSnapshot,
    candidate: PreparedFsIntegrationRegistryCandidate,
    evaluator: IntegrationCompatibilityEvaluator,
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[],
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore,
): Promise<IntegrationCompatibilityAdmissionDecision> {
    return evaluator.evaluateAdmission(
        await buildPublicationCompatibilityInput(
            snapshot,
            candidate,
            schemaDeclarationEvidence,
            reviewedSchemaBaselines,
        ),
    );
}

export async function buildPublicationCompatibilityInput(
    snapshot: IntegrationRegistryCatalogSnapshot,
    candidate: PreparedFsIntegrationRegistryCandidate,
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[],
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore,
): Promise<IntegrationCompatibilityEvaluationInput> {
    const candidateReviewedSchemaBaselines = await loadPackageReviewedSchemaBaselines(
        reviewedSchemaBaselines,
        candidate.definition.kind,
        candidate.definition.version!,
        candidate.package.digest,
    );
    const candidatePackage: IntegrationCompatibilityPackage = {
        definition: candidate.definition,
        packageDigest: candidate.package.digest,
        ...(candidateReviewedSchemaBaselines.length > 0
            ? { reviewedSchemaBaselines: candidateReviewedSchemaBaselines }
            : {}),
        ...(schemaDeclarationEvidence ? { schemaDeclarationEvidence } : {}),
    };
    const index = snapshot.getIndex(candidate.definition.kind);
    if (!index) {
        return { candidate: candidatePackage, noBaselineReason: "new-kind" };
    }
    const enforcingVersion = [...index.versions]
        .reverse()
        .find((entry) => integrationVersionsShareMajor(entry.version, candidate.definition.version!))?.version;
    if (enforcingVersion) {
        const baseline = await loadCompatibilityPackage(
            snapshot,
            candidate.limits,
            candidate.definition.kind,
            enforcingVersion,
            reviewedSchemaBaselines,
        );
        return {
            baseline,
            candidate: candidatePackage,
            changedPaths: await changedPaths(snapshot, candidate.limits, baseline, candidate),
        };
    }
    const informationalVersion = index.stable ?? index.latest;
    const informationalBaseline = informationalVersion
        ? await loadCompatibilityPackage(
              snapshot,
              candidate.limits,
              candidate.definition.kind,
              informationalVersion,
              reviewedSchemaBaselines,
          )
        : undefined;
    const input: IntegrationCompatibilityEvaluationInput = {
        candidate: candidatePackage,
        noBaselineReason: "new-major",
        ...(informationalBaseline ? { informationalBaseline } : {}),
        ...(informationalBaseline
            ? { changedPaths: await changedPaths(snapshot, candidate.limits, informationalBaseline, candidate) }
            : {}),
    };
    return input;
}

async function changedPaths(
    snapshot: IntegrationRegistryCatalogSnapshot,
    limits: Readonly<IntegrationPackageLimits>,
    baseline: IntegrationCompatibilityPackage,
    candidate: PreparedFsIntegrationRegistryCandidate,
): Promise<readonly string[]> {
    const source = packageSource(snapshot, limits);
    const baselinePackage = await source.getPackage(baseline.definition.kind, baseline.definition.version!);
    if (!baselinePackage) {
        throw new Error("Compatibility baseline package disappeared from its captured catalog snapshot");
    }
    return changedIntegrationPackagePaths(baselinePackage.envelope, candidate.package.envelope);
}

async function loadCompatibilityPackage(
    snapshot: IntegrationRegistryCatalogSnapshot,
    limits: Readonly<IntegrationPackageLimits>,
    kind: string,
    version: string,
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore,
): Promise<IntegrationCompatibilityPackage> {
    const location = snapshot.locateExactVersion(kind, version);
    if (!location) {
        throw new Error(`Compatibility baseline ${kind}@${version} is missing from its captured catalog snapshot`);
    }
    const resolved = await packageSource(snapshot, limits).getPackage(kind, version);
    if (!resolved || resolved.digest !== location.package.digest) {
        throw new Error(`Compatibility baseline ${kind}@${version} cannot be reproduced from its captured snapshot`);
    }
    const reviewed = await loadPackageReviewedSchemaBaselines(reviewedSchemaBaselines, kind, version, resolved.digest);
    return {
        definition: location.definitionSnapshot,
        packageDigest: resolved.digest,
        ...(reviewed.length > 0 ? { reviewedSchemaBaselines: reviewed } : {}),
    };
}

async function loadPackageReviewedSchemaBaselines(
    store: ReviewedSchemaBaselineStore | undefined,
    kind: string,
    version: string,
    packageDigest: string,
) {
    return store ? await loadReviewedConnectorSchemaBaselines(store, kind, version, packageDigest) : [];
}

function packageSource(snapshot: IntegrationRegistryCatalogSnapshot, limits: Readonly<IntegrationPackageLimits>) {
    return new SnapshotIntegrationPackageSource({ snapshots: { current: () => snapshot }, limits });
}
