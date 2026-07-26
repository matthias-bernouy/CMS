import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import {
    createIntegrationRegistryCatalogSnapshot,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    IntegrationRegistryCatalogSnapshotReference,
} from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    FsIntegrationRegistryPublisher,
    FsReviewedSchemaBaselineStore,
    writeIntegrationRegistryVersionManifest,
} from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../baselines/fixtures";

const roots: string[] = [];

export function cleanupRegistryFixtures(): void {
    for (const root of roots.splice(0)) {
        makeFixtureWritable(root);
        rmSync(root, { recursive: true, force: true });
    }
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
    const publisher = new FsIntegrationRegistryPublisher({
        root,
        snapshots,
        compatibility,
        mutations,
        reviewedSchemaBaselines,
        now: () => "2026-07-26T10:00:00.000Z",
        ...overrides,
    });
    return { root, snapshots, compatibility, mutations, publisher, reviewedSchemaBaselines };
}

export async function publicationPackage(
    kind: string,
    version: string,
    definitionOverrides: Record<string, unknown> = {},
    implementation = `implementation ${version}\n`,
    additionalFiles: IntegrationPackageEnvelopeV1["files"] = {},
): Promise<ResolvedIntegrationPackage> {
    const definition = {
        kind,
        label: `Integration ${kind}`,
        version,
        inputs: [],
        ...definitionOverrides,
    };
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: `# ${kind} ${version}\n` },
            "definition.json": { encoding: "utf8", content: JSON.stringify(definition) },
            "implementation.txt": { encoding: "utf8", content: implementation },
            ...additionalFiles,
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export async function publishReviewedSqlVersionPair(fixture: ReturnType<typeof registryFixture>) {
    const baselinePackage = await seedLegacySqlBaseline(fixture);
    await fixture.reviewedSchemaBaselines.append({
        baseline: await reviewedBaseline("demo-schema-baseline", {
            kind: "demo",
            packageDigest: baselinePackage.digest,
        }),
        expectedCurrentRevisionId: null,
    });
    const candidate = await fixture.publisher.publish({
        package: await sqlPublicationPackage("demo", "1.0.1", reviewedSchemaContract()),
    });
    return { baselinePackage, candidate };
}

export async function seedLegacySqlBaseline(fixture: ReturnType<typeof registryFixture>) {
    const baselinePackage = await sqlPublicationPackage("demo", "1.0.0");
    const integrationRoot = join(fixture.root, "demo");
    const versionsRoot = join(integrationRoot, "versions");
    mkdirSync(versionsRoot, { recursive: true, mode: 0o750 });
    await writeImmutableIntegrationPackageDirectory(baselinePackage, {
        destination: join(versionsRoot, "1.0.0"),
        expected: { kind: "demo", version: "1.0.0", digest: baselinePackage.digest },
    });
    await writeIntegrationRegistryVersionManifest({ integrationRoot, package: baselinePackage });
    writeFileSync(
        join(integrationRoot, "integration.json"),
        canonicalJsonBytes({
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Integration demo",
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [
                {
                    version: "1.0.0",
                    path: "versions/1.0.0",
                    definition: "versions/1.0.0/definition.json",
                },
            ],
        }),
        { mode: 0o640 },
    );
    fixture.snapshots.swap(await buildFsIntegrationRegistryCatalogSnapshot({ root: fixture.root }));
    return baselinePackage;
}

export async function sqlPublicationPackage(kind: string, version: string, schema?: unknown) {
    return await publicationPackage(
        kind,
        version,
        {
            connectors: [
                {
                    provider: "supabase",
                    root: "connectors/supabase",
                    schemas: [{ path: "sql/schema.sql" }],
                    ...(schema ? { compatibility: { schema } } : {}),
                },
            ],
        },
        `implementation ${version}\n`,
        {
            "connectors/supabase/sql/schema.sql": {
                encoding: "utf8",
                content: "create schema if not exists public;\n",
            },
        },
    );
}

export function reviewedSchemaContract() {
    return { namespaces: [{ name: "public", relations: [] }] };
}
