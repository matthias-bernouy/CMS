import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import {
    createIntegrationRegistryCatalogSnapshot,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationCompatibilityEvaluator,
    IntegrationRegistryCatalogSnapshotReference,
} from "@bernouy/cms-integration-registry";
import { FsIntegrationRegistryPublisher } from "@bernouy/cms-integration-registry/fs";

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
    const publisher = new FsIntegrationRegistryPublisher({
        root,
        snapshots,
        compatibility,
        mutations,
        now: () => "2026-07-26T10:00:00.000Z",
        ...overrides,
    });
    return { root, snapshots, compatibility, mutations, publisher };
}

export async function publicationPackage(
    kind: string,
    version: string,
    definitionOverrides: Record<string, unknown> = {},
    implementation = `implementation ${version}\n`,
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
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}
