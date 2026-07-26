import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionDecision,
    identifyVerificationReport,
} from "@bernouy/cms-integration-verification";
import type { OfficialRepositoryBootstrapPlanProjection } from "../../../../../interfaces/publication";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationVerificationBundleStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
} from "../../../../../interfaces/reportStore";
import { FsIntegrationVerificationBundleStore } from "../../history/evidence/store/bundles";
import {
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
} from "../../history/evidence/stores";
import type { FsOfficialIntegrationRegistryBootstrapPublisherConfig } from "./types";

type BootstrapReleaseEvidenceStores = Readonly<{
    bundles: IntegrationVerificationBundleStore;
    compatibility: IntegrationCompatibilityV2ReportStore;
    verification: IntegrationVerificationReportStore;
    decisions: ReleaseAdmissionDecisionStore;
}>;

export function bootstrapReleaseEvidenceStores(
    config: FsOfficialIntegrationRegistryBootstrapPublisherConfig,
): BootstrapReleaseEvidenceStores {
    const common = { root: config.root, snapshots: config.snapshots, mutations: config.mutations };
    const compatibility = config.compatibilityV2Reports ?? new FsIntegrationCompatibilityV2ReportStore(common);
    const verification = config.verificationReports ?? new FsIntegrationVerificationReportStore(common);
    const migrations = config.migrationReports ?? new FsIntegrationMigrationReportStore(common);
    const decisions =
        config.releaseDecisions ??
        new FsReleaseAdmissionDecisionStore({
            ...common,
            compatibilityReports: compatibility,
            verificationReports: verification,
            migrationReports: migrations,
        });
    return {
        bundles: config.verificationBundles ?? new FsIntegrationVerificationBundleStore(config.root),
        compatibility,
        verification,
        decisions,
    };
}

export async function commitOfficialVerificationBackfills(
    stores: BootstrapReleaseEvidenceStores,
    plan: OfficialRepositoryBootstrapPlanProjection,
): Promise<void> {
    for (const entry of plan.verificationBackfills) {
        await stores.bundles.put({
            envelope: entry.verification.envelope,
            canonicalBytes: canonicalJsonBytes(entry.verification.envelope),
            digest: entry.verification.digest,
        });
        await stores.compatibility.append({ report: entry.compatibilityReport, expectedCurrent: null });
        await stores.verification.append({ report: entry.verificationReport, expectedCurrent: null });
        await stores.decisions.append({ report: entry.decision, expectedCurrent: null });
    }
}

export async function assertCompleteOfficialVerificationBackfills(
    stores: BootstrapReleaseEvidenceStores,
    plan: OfficialRepositoryBootstrapPlanProjection,
): Promise<void> {
    for (const entry of plan.verificationBackfills) {
        const bundle = await stores.bundles.get(entry.verification.digest);
        const compatibility = await stores.compatibility.get(entry.transition.kind, entry.transition.version);
        const verification = await stores.verification.get(entry.transition.kind, entry.transition.version);
        const decision = await stores.decisions.get(entry.transition.kind, entry.transition.version);
        const expectedCompatibility = await identifyCompatibilityReportV2(entry.compatibilityReport);
        const expectedVerification = await identifyVerificationReport(entry.verificationReport);
        const expectedDecision = await identifyReleaseAdmissionDecision(entry.decision);
        if (
            !bundle ||
            bundle.digest !== entry.verification.digest ||
            compatibility?.currentRevisionId !== entry.compatibilityReport.reportId ||
            compatibility.currentReportDigest !== expectedCompatibility.digest ||
            verification?.currentRevisionId !== entry.verificationReport.reportId ||
            verification.currentReportDigest !== expectedVerification.digest ||
            decision?.currentRevisionId !== entry.decision.decisionId ||
            decision.currentReportDigest !== expectedDecision.digest ||
            expectedDecision.digest !== entry.transition.finalDecisionDigest
        ) {
            throw new Error("Official bootstrap did not persist its exact verification backfill plan");
        }
    }
}
