import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
    identifyIntegrationVerificationBackfillRequest,
    type IntegrationVerificationBackfillRequest,
    type PreparedIntegrationVerificationBackfill,
} from "@bernouy/cms-integration-registry";
import {
    FsIntegrationVerificationBackfiller,
    FsIntegrationVerificationBundleStore,
    type FsIntegrationVerificationBackfillerConfig,
} from "@bernouy/cms-integration-registry/fs";
import { publicationPackage, registryFixture } from "../../publication/fixtures";
import { releaseStores } from "../fixtures/stores";
import { verificationBackfill } from "./fixture";

export async function populatedBackfillFixture(
    overrides: Partial<FsIntegrationVerificationBackfillerConfig> = {},
    options: Readonly<{ unverifiedPublication?: boolean }> = {},
) {
    const fixture = registryFixture();
    const integrationPackage = await publicationPackage("demo", "1.0.0");
    if (options.unverifiedPublication) {
        await fixture.publishUnverified(integrationPackage);
    } else {
        await fixture.publisher.publish({ package: integrationPackage });
    }
    const entry = verificationBackfill(integrationPackage);
    const request = backfillRequest(entry);
    const identified = await identifyIntegrationVerificationBackfillRequest(request);
    const stores = releaseStores(fixture);
    const bundles = new FsIntegrationVerificationBundleStore(fixture.root);
    const config: FsIntegrationVerificationBackfillerConfig = {
        root: fixture.root,
        approvedRequestDigests: [identified.digest],
        snapshots: fixture.snapshots,
        mutations: fixture.mutations,
        bundles,
        compatibilityReports: stores.compatibilityReports,
        verificationReports: stores.verificationReports,
        decisions: stores.decisions,
        reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
        createOperationId: () => "verification-backfill-operation",
        now: () => "2026-07-26T12:00:00.000Z",
        ...overrides,
    };
    return {
        fixture,
        integrationPackage,
        entry,
        stores,
        bundles,
        config,
        backfiller: new FsIntegrationVerificationBackfiller(config),
        request,
        requestDigest: identified.digest,
    };
}

export function backfillRequest(
    entry: PreparedIntegrationVerificationBackfill,
): IntegrationVerificationBackfillRequest {
    return {
        schema: INTEGRATION_VERIFICATION_BACKFILL_SCHEMA,
        verification: { envelope: entry.verification.envelope, digest: entry.verification.digest },
        compatibilityReport: entry.compatibilityReport,
        verificationReport: entry.verificationReport,
        statefulChanges: entry.statefulChanges,
        decision: entry.decision,
    };
}

export async function alternateBackfillRequest(
    entry: PreparedIntegrationVerificationBackfill,
): Promise<IntegrationVerificationBackfillRequest> {
    const envelope = {
        ...entry.verification.envelope,
        files: {
            ...entry.verification.envelope.files,
            "proof.txt": { encoding: "utf8" as const, content: "different immutable evidence\n" },
        },
    };
    const verificationDigest = await sha256Hex(canonicalJsonBytes(envelope));
    const verificationReport = { ...entry.verificationReport, verificationDigest };
    const verificationReportDigest = await sha256Hex(canonicalJsonBytes(verificationReport));
    return {
        ...backfillRequest(entry),
        verification: { envelope, digest: verificationDigest },
        verificationReport,
        decision: {
            ...entry.decision,
            verificationReport: {
                revisionId: verificationReport.reportId,
                reportDigest: verificationReportDigest,
            },
        },
    };
}

export async function orphanBackfillRequest(): Promise<IntegrationVerificationBackfillRequest> {
    const integrationPackage = await publicationPackage("absent", "1.0.0");
    return backfillRequest(verificationBackfill(integrationPackage));
}
