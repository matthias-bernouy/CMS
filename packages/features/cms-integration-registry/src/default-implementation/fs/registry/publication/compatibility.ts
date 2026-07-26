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
    IntegrationCompatibilityEvaluationInput,
    IntegrationCompatibilityPackage,
    TrustedSchemaDeclarationEvidence,
} from "../../../../interfaces/compatibility";
import type { PreparedFsIntegrationRegistryCandidate } from "./candidate";
import { SnapshotIntegrationPackageSource } from "../../snapshot/snapshotPackageSource";

export async function evaluatePublicationCompatibility(
    snapshot: IntegrationRegistryCatalogSnapshot,
    candidate: PreparedFsIntegrationRegistryCandidate,
    evaluator: IntegrationCompatibilityEvaluator,
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[],
): Promise<IntegrationCompatibilityAdmissionReport> {
    const candidatePackage: IntegrationCompatibilityPackage = {
        definition: candidate.definition,
        packageDigest: candidate.package.digest,
        ...(schemaDeclarationEvidence ? { schemaDeclarationEvidence } : {}),
    };
    const index = snapshot.getIndex(candidate.definition.kind);
    if (!index) {
        return assertIntegrationCompatibilityAdmission(
            evaluator.evaluateAdmission({ candidate: candidatePackage, noBaselineReason: "new-kind" }),
        );
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
        );
        return assertIntegrationCompatibilityAdmission(
            evaluator.evaluateAdmission({
                baseline,
                candidate: candidatePackage,
                changedPaths: await changedPaths(snapshot, candidate.limits, baseline, candidate),
            }),
        );
    }
    const informationalVersion = index.stable ?? index.latest;
    const informationalBaseline = informationalVersion
        ? await loadCompatibilityPackage(snapshot, candidate.limits, candidate.definition.kind, informationalVersion)
        : undefined;
    const input: IntegrationCompatibilityEvaluationInput = {
        candidate: candidatePackage,
        noBaselineReason: "new-major",
        ...(informationalBaseline ? { informationalBaseline } : {}),
        ...(informationalBaseline
            ? { changedPaths: await changedPaths(snapshot, candidate.limits, informationalBaseline, candidate) }
            : {}),
    };
    return assertIntegrationCompatibilityAdmission(evaluator.evaluateAdmission(input));
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
): Promise<IntegrationCompatibilityPackage> {
    const location = snapshot.locateExactVersion(kind, version);
    if (!location) {
        throw new Error(`Compatibility baseline ${kind}@${version} is missing from its captured catalog snapshot`);
    }
    const resolved = await packageSource(snapshot, limits).getPackage(kind, version);
    if (!resolved || resolved.digest !== location.package.digest) {
        throw new Error(`Compatibility baseline ${kind}@${version} cannot be reproduced from its captured snapshot`);
    }
    return { definition: location.definitionSnapshot, packageDigest: resolved.digest };
}

function packageSource(snapshot: IntegrationRegistryCatalogSnapshot, limits: Readonly<IntegrationPackageLimits>) {
    return new SnapshotIntegrationPackageSource({ snapshots: { current: () => snapshot }, limits });
}
