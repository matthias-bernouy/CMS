import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import {
    identifyIntegrationVerificationBackfillRequest,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationRegistryCatalogSnapshotReference,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationVerificationBackfiller,
    FsIntegrationVerificationBundleStore,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
    FsReviewedSchemaBaselineStore,
    writeIntegrationRegistryVersionManifest,
} from "@bernouy/cms-integration-registry/fs";
import { legacyBackfillRequest } from "./repositoryFixtureEvidence";

const VERSION = "1.0.0";
const INTEGRATION_KINDS = [
    "ban",
    "basic-blocs",
    "commerce",
    "commerce-mondial-relay-delivery",
    "commerce-mondial-relay-fulfillment",
    "commerce-negotiation",
    "commerce-stripe-payments",
    "emailer",
    "mondial-relay",
    "newsletter",
    "photo-albums",
    "sales-configurator",
    "stripe-connect",
    "user-account",
] as const;

export async function seedRepositoryFixture(root: string): Promise<void> {
    const packages = await Promise.all(INTEGRATION_KINDS.map(fixturePackage));
    await Promise.all(packages.map((integrationPackage) => writeFixturePackage(root, integrationPackage)));
    const snapshots = new IntegrationRegistryCatalogSnapshotReference(
        await buildFsIntegrationRegistryCatalogSnapshot({ root }),
    );
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const storeConfig = { root, snapshots, mutations };
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(storeConfig);
    const verificationReports = new FsIntegrationVerificationReportStore(storeConfig);
    const migrationReports = new FsIntegrationMigrationReportStore(storeConfig);
    const decisions = new FsReleaseAdmissionDecisionStore({
        ...storeConfig,
        compatibilityReports,
        verificationReports,
        migrationReports,
    });
    const requests = packages.map(legacyBackfillRequest);
    const identified = await Promise.all(requests.map(identifyIntegrationVerificationBackfillRequest));
    let operation = 0;
    const backfiller = new FsIntegrationVerificationBackfiller({
        ...storeConfig,
        approvedRequestDigests: identified.map(({ digest }) => digest),
        bundles: new FsIntegrationVerificationBundleStore(root),
        compatibilityReports,
        verificationReports,
        decisions,
        reviewedSchemaBaselines: new FsReviewedSchemaBaselineStore({ root }),
        createOperationId: () => `repository-hub-fixture-backfill-${++operation}`,
        now: () => "2026-07-26T10:00:00.000Z",
    });
    for (const request of requests) {
        await backfiller.backfill(request);
    }
}

async function fixturePackage(kind: string): Promise<ResolvedIntegrationPackage> {
    const label = kind
        .split("-")
        .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
        .join(" ");
    const definition = JSON.stringify({
        schema: "cms.integration.definition.v1",
        kind,
        label,
        version: VERSION,
        inputs: [],
    });
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind,
        version: VERSION,
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: `# ${label}\n` },
            "definition.json": { encoding: "utf8", content: definition },
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

async function writeFixturePackage(root: string, integrationPackage: ResolvedIntegrationPackage): Promise<void> {
    const { kind, version } = integrationPackage.envelope;
    const integrationRoot = join(root, kind);
    const versionRoot = join(integrationRoot, "versions", version);
    await mkdir(join(integrationRoot, "versions"), { recursive: true });
    await writeImmutableIntegrationPackageDirectory(integrationPackage, {
        destination: versionRoot,
        expected: { kind, version, digest: integrationPackage.digest },
    });
    await writeIntegrationRegistryVersionManifest({ integrationRoot, package: integrationPackage });
    await writeFile(
        join(integrationRoot, "integration.json"),
        canonicalJsonBytes({
            schema: "cms.integration.index.v1",
            kind,
            label: `Integration ${kind}`,
            stable: version,
            latest: version,
            versions: [
                {
                    version,
                    path: `versions/${version}`,
                    definition: `versions/${version}/definition.json`,
                    status: "unverified",
                },
            ],
        }),
    );
}
