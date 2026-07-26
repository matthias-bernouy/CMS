import {
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
} from "@bernouy/cms-integration-registry/fs";
import { publicationPackage, registryFixture } from "../../publication/fixtures";

export async function publishedReleaseFixture() {
    const fixture = registryFixture();
    const source = await publicationPackage("demo", "1.0.0");
    const target = await publicationPackage("demo", "1.1.0");
    await fixture.publisher.publish({ package: source });
    await fixture.publisher.publish({ package: target });
    return { fixture, source, target, stores: releaseStores(fixture) };
}

export function releaseStores(
    fixture: ReturnType<typeof registryFixture>,
    limits?: Readonly<{ historiesPerStream?: number; revisionsPerHistory?: number }>,
) {
    const config = { root: fixture.root, snapshots: fixture.snapshots, mutations: fixture.mutations, limits };
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(config);
    const verificationReports = new FsIntegrationVerificationReportStore(config);
    const migrationReports = new FsIntegrationMigrationReportStore(config);
    const decisions = new FsReleaseAdmissionDecisionStore({
        ...config,
        compatibilityReports,
        verificationReports,
        migrationReports,
    });
    return { compatibilityReports, verificationReports, migrationReports, decisions };
}
