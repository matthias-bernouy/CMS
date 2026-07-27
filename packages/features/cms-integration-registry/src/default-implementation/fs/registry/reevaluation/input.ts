import type { IntegrationPackageEnvelopeV1, IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { CompatibilityReportV2, VersionDigestReference } from "@bernouy/cms-integration-verification";
import { changedIntegrationPackagePaths } from "../../../../core/publication/changedPaths";
import { IntegrationCompatibilityReevaluationIntegrityError } from "../../../../core/compatibility/reevaluation/errors";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../interfaces/catalog";
import type {
    IntegrationCompatibilityEvaluationInput,
    IntegrationCompatibilityPackage,
} from "../../../../interfaces/compatibility";
import type { ReviewedSchemaBaselineStore } from "../../../../interfaces/reportStore";
import { loadReviewedConnectorSchemaBaselines } from "../baselines/projection";
import { SnapshotIntegrationPackageSource } from "../../snapshot/snapshotPackageSource";

type LoadedCompatibilityPackage = Readonly<{
    compatibility: IntegrationCompatibilityPackage;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export async function buildFsCompatibilityReevaluationInput(
    snapshot: IntegrationRegistryCatalogSnapshot,
    root: CompatibilityReportV2,
    limits?: Partial<IntegrationPackageLimits>,
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore,
): Promise<IntegrationCompatibilityEvaluationInput> {
    const source = new SnapshotIntegrationPackageSource({ snapshots: { current: () => snapshot }, limits });
    const candidate = await loadPackage(
        snapshot,
        source,
        { kind: root.kind, version: root.version, packageDigest: root.packageDigest },
        "candidate",
        reviewedSchemaBaselines,
    );
    assertRootBaselineShape(root);
    if (root.baselines.length === 1) {
        const baseline = await loadPackage(
            snapshot,
            source,
            root.baselines[0]!,
            "enforcing baseline",
            reviewedSchemaBaselines,
        );
        return {
            baseline: baseline.compatibility,
            candidate: candidate.compatibility,
            changedPaths: changedIntegrationPackagePaths(baseline.envelope, candidate.envelope),
        };
    }
    if (root.noBaselineReason === "new-kind") {
        return { candidate: candidate.compatibility, noBaselineReason: "new-kind" };
    }
    const informational = root.informationalBaselines[0];
    if (!informational) {
        return { candidate: candidate.compatibility, noBaselineReason: "new-major" };
    }
    const baseline = await loadPackage(
        snapshot,
        source,
        informational,
        "informational baseline",
        reviewedSchemaBaselines,
    );
    return {
        candidate: candidate.compatibility,
        noBaselineReason: "new-major",
        informationalBaseline: baseline.compatibility,
        changedPaths: changedIntegrationPackagePaths(baseline.envelope, candidate.envelope),
    };
}

function assertRootBaselineShape(root: CompatibilityReportV2): void {
    const enforcing = root.baselines.length;
    const informational = root.informationalBaselines.length;
    const validEnforcing = enforcing === 1 && informational === 0 && root.noBaselineReason === undefined;
    const validNewKind = enforcing === 0 && informational === 0 && root.noBaselineReason === "new-kind";
    const validNewMajor = enforcing === 0 && informational <= 1 && root.noBaselineReason === "new-major";
    if (!validEnforcing && !validNewKind && !validNewMajor) {
        throw new IntegrationCompatibilityReevaluationIntegrityError(
            `Compatibility root ${root.reportId} has an invalid immutable baseline shape`,
        );
    }
}

async function loadPackage(
    snapshot: IntegrationRegistryCatalogSnapshot,
    source: SnapshotIntegrationPackageSource,
    reference: VersionDigestReference,
    label: string,
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore,
): Promise<LoadedCompatibilityPackage> {
    const location = snapshot.locateExactVersion(reference.kind, reference.version);
    if (!location || location.package.digest !== reference.packageDigest) {
        throw new IntegrationCompatibilityReevaluationIntegrityError(
            `Compatibility ${label} ${reference.kind}@${reference.version} does not match its immutable digest`,
        );
    }
    try {
        const resolved = await source.getPackage(reference.kind, reference.version);
        if (!resolved || resolved.digest !== reference.packageDigest) {
            throw new Error("resolved package digest does not match the report reference");
        }
        const reviewed = reviewedSchemaBaselines
            ? await loadReviewedConnectorSchemaBaselines(
                  reviewedSchemaBaselines,
                  reference.kind,
                  reference.version,
                  reference.packageDigest,
              )
            : [];
        return {
            compatibility: {
                definition: location.definitionSnapshot,
                packageDigest: resolved.digest,
                ...(reviewed.length > 0 ? { reviewedSchemaBaselines: reviewed } : {}),
            },
            envelope: resolved.envelope,
        };
    } catch (error) {
        throw new IntegrationCompatibilityReevaluationIntegrityError(
            `Compatibility ${label} ${reference.kind}@${reference.version} cannot be reproduced from the captured snapshot`,
            { cause: error },
        );
    }
}
