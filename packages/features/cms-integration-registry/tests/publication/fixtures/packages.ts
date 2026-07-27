import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { writeImmutableIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    writeIntegrationRegistryVersionManifest,
} from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../../baselines/fixtures";
import type { registryFixture } from "./registry";

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

export async function publishReviewedSqlVersionPair(
    fixture: ReturnType<typeof registryFixture>,
    candidateSchema: unknown = reviewedSchemaContract(),
    candidateVersion = "1.0.1",
) {
    const baselinePackage = await seedLegacySqlBaseline(fixture);
    await fixture.reviewedSchemaBaselines.append({
        baseline: await reviewedBaseline("demo-schema-baseline", {
            kind: "demo",
            packageDigest: baselinePackage.digest,
        }),
        expectedCurrentRevisionId: null,
    });
    const candidate = await fixture.publisher.publish({
        package: await sqlPublicationPackage("demo", candidateVersion, candidateSchema),
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

export async function statefulSqlPublicationPackage(kind: string, version: string, schema: unknown) {
    const checksum = `sha256:${"1".repeat(64)}`;
    return await publicationPackage(
        kind,
        version,
        {
            connectors: [
                {
                    provider: "supabase",
                    connectorKey: "primary",
                    lineageId: `${kind}-supabase-v1`,
                    migrationRevision: 1,
                    root: "connectors/supabase",
                    schemas: [{ path: "install/schema.sql" }],
                    compatibility: { schema },
                    migration: {
                        install: {
                            revision: 1,
                            digest: `sha256:${"2".repeat(64)}`,
                            coveredMigrations: [{ id: "add-items", checksum, revision: 1, introducedIn: version }],
                        },
                        migrations: [
                            {
                                id: "add-items",
                                checksum,
                                fromRevision: 0,
                                toRevision: 1,
                                introducedIn: version,
                                transaction: "atomic",
                                phase: "expand",
                                path: "migrations/001-add-items.sql",
                            },
                        ],
                        supportedSources: [{ range: "^1.0.0", migrationRevision: 0 }],
                        pointOfNoReturn: "before-contract",
                    },
                },
            ],
        },
        `implementation ${version}\n`,
        {
            "connectors/supabase/install/schema.sql": {
                encoding: "utf8",
                content: "create schema if not exists public;\n",
            },
            "connectors/supabase/migrations/001-add-items.sql": {
                encoding: "utf8",
                content: "select 1;\n",
            },
        },
    );
}

export function reviewedSchemaContract() {
    return { namespaces: [{ name: "public", relations: [] }] };
}
