import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createIntegrationRegistryCatalogSnapshot,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    IntegrationRegistryCatalogSnapshotReference,
    type IntegrationRegistryPublisher,
} from "@bernouy/cms-integration-registry";
import { FsIntegrationRegistryPublisher, FsReviewedSchemaBaselineStore } from "@bernouy/cms-integration-registry/fs";
import { prepareFsIntegrationRegistryCandidate } from "../../../src/default-implementation/fs/registry/publication/candidate";
import { publishPreparedFsIntegrationRegistryCandidate } from "../../../src/default-implementation/fs/registry/publication/publisher";

const roots: string[] = [];

export function cleanupRegistryFixtures(): void {
    for (const root of roots.splice(0)) {
        makeFixtureWritable(root);
        rmSync(root, { recursive: true, force: true });
    }
}

export function registryFixture(
    overrides: Partial<ConstructorParameters<typeof FsIntegrationRegistryPublisher>[0]> = {},
) {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-registry-publisher-"));
    roots.push(root);
    mkdirSync(root, { recursive: true });
    const snapshots = new IntegrationRegistryCatalogSnapshotReference(
        createIntegrationRegistryCatalogSnapshot({ entries: [] }),
    );
    let reportSequence = 0;
    const compatibility = new IntegrationCompatibilityEvaluator({
        identity: { name: "registry-test", version: "1.0.0" },
        now: () => "2026-07-26T10:00:00.000Z",
        createReportId: () => `report-${++reportSequence}`,
    });
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const reviewedSchemaBaselines = new FsReviewedSchemaBaselineStore({ root });
    const publicationConfig = {
        root,
        snapshots,
        compatibility,
        mutations,
        reviewedSchemaBaselines,
        now: () => "2026-07-26T10:00:00.000Z",
        ...overrides,
    };
    const rawPublisher = new FsIntegrationRegistryPublisher({
        ...publicationConfig,
        rawPublicationPolicy: overrides.rawPublicationPolicy ?? "reject-unverified",
    });
    const publisher: IntegrationRegistryPublisher = {
        async publish(request) {
            const candidate = await prepareFsIntegrationRegistryCandidate(
                request.package,
                publicationConfig.packageLimits,
            );
            return await publishPreparedFsIntegrationRegistryCandidate(
                publicationConfig,
                candidate,
                request.schemaDeclarationEvidence,
            );
        },
    };
    return {
        root,
        snapshots,
        compatibility,
        mutations,
        publicationConfig,
        publisher,
        rawPublisher,
        reviewedSchemaBaselines,
    };
}

function makeFixtureWritable(path: string): void {
    const metadata = lstatSync(path);
    if (!metadata.isDirectory()) {
        return;
    }
    chmodSync(path, 0o750);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            makeFixtureWritable(join(path, entry.name));
        }
    }
}
