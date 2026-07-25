import { afterEach, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { IntegrationRegistryCatalogSnapshotReference } from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    SnapshotIntegrationPackageSource,
    writeIntegrationRegistryVersionManifest,
    type WrittenIntegrationRegistryVersionManifest,
} from "@bernouy/cms-integration-registry/fs";
import { writeIntegrationFixture } from "./fixtures";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("filesystem snapshot package authority", () => {
    test("preserves ASCII base64 and non-README release notes across snapshot rebuilds", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const written = await installCanonicalManifest(integrationRoot);

        const first = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const second = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(second),
        });
        const loaded = await source.getPackage("demo", "1.0.0");

        expect(first.locateExactVersion("demo", "1.0.0")?.package.digest).toBe(written.package.digest);
        expect(second.locateExactVersion("demo", "1.0.0")?.manifestPath).toBe(written.path);
        expect(loaded?.envelope.releaseNotes).toBe("notes/changes.md");
        expect(loaded?.envelope.files["assets/icon.svg"]?.encoding).toBe("base64");
        expect(loaded?.digest).toBe(written.package.digest);
    });

    test("rejects version-root mutation instead of serving bytes outside the manifest", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        await installCanonicalManifest(integrationRoot);
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        writeFileSync(join(integrationRoot, "versions", "1.0.0", "assets", "icon.svg"), "<svg>mutated</svg>");

        await expect(source.getPackage("demo", "1.0.0")).rejects.toThrow(/differs from its expected envelope/);
    });

    test("rejects manifest mutation after the snapshot captured its digest", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const written = await installCanonicalManifest(integrationRoot);
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        const replacement = join(dirname(written.path), "replacement.json");
        writeFileSync(replacement, `${JSON.stringify(written.document, null, 2)}\n`);
        renameSync(replacement, written.path);

        await expect(source.getPackage("demo", "1.0.0")).rejects.toThrow(/canonical JSON bytes/);
    });
});

async function installCanonicalManifest(integrationRoot: string): Promise<WrittenIntegrationRegistryVersionManifest> {
    const versionRoot = join(integrationRoot, "versions", "1.0.0");
    unlinkSync(join(versionRoot, "README.md"));
    mkdirSync(join(versionRoot, "notes"));
    writeFileSync(join(versionRoot, "notes", "changes.md"), "# Canonical release notes\n");
    const packageRead = await readIntegrationPackageDirectory({
        root: versionRoot,
        kind: "demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "notes/changes.md",
    });
    const icon = packageRead.envelope.files["assets/icon.svg"]!;
    const envelope: IntegrationPackageEnvelopeV1 = {
        ...packageRead.envelope,
        files: {
            ...packageRead.envelope.files,
            "assets/icon.svg": {
                encoding: "base64",
                content: Buffer.from(icon.content, "utf8").toString("base64"),
            },
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    const packageInput: ResolvedIntegrationPackage = {
        envelope,
        canonicalBytes,
        digest: await sha256Hex(canonicalBytes),
    };
    return await writeIntegrationRegistryVersionManifest({ integrationRoot, package: packageInput });
}

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-snapshot-safety-"));
    roots.push(root);
    return root;
}
