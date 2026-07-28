import { afterEach, describe, expect, test } from "bun:test";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import {
    IntegrationRegistryVersionManifestConflictError,
    readIntegrationRegistryVersionManifest,
    writeIntegrationRegistryVersionManifest,
} from "@bernouy/cms-integration-registry/fs";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("immutable integration registry version manifests", () => {
    test("round-trips the complete canonical envelope without changing file encodings", async () => {
        const integrationRoot = fixtureRoot();
        const input = await resolvedPackage();

        const written = await writeIntegrationRegistryVersionManifest({ integrationRoot, package: input });
        const loaded = await readIntegrationRegistryVersionManifest({
            path: written.path,
            integrationRoot,
            expectedKind: "manifest-demo",
            expectedVersion: "1.0.0",
        });

        expect(loaded?.envelope.releaseNotes).toBe("notes/releases/1.0.0.md");
        expect(loaded?.envelope.files["assets/ascii.svg"]?.encoding).toBe("base64");
        expect(loaded?.digest).toBe(input.digest);
        expect(readFileSync(written.path)).toEqual(written.documentBytes);
        expect(statSync(written.path).mode & 0o777).toBe(0o440);
        expect(readdirSync(dirname(written.path))).toEqual(["1.0.0.json"]);
    });

    test("publishes with no-overwrite semantics and exposes a 409 conflict", async () => {
        const integrationRoot = fixtureRoot();
        const input = await resolvedPackage();
        const first = await writeIntegrationRegistryVersionManifest({ integrationRoot, package: input });

        const conflict = writeIntegrationRegistryVersionManifest({ integrationRoot, package: input });

        await expect(conflict).rejects.toBeInstanceOf(IntegrationRegistryVersionManifestConflictError);
        await expect(conflict).rejects.toMatchObject({ status: 409, path: first.path });
        expect(readFileSync(first.path)).toEqual(first.documentBytes);
        expect(readdirSync(dirname(first.path))).toEqual(["1.0.0.json"]);
    });

    test("rejects non-canonical manifest mutation and inconsistent source identity", async () => {
        const integrationRoot = fixtureRoot();
        const input = await resolvedPackage();
        const written = await writeIntegrationRegistryVersionManifest({ integrationRoot, package: input });
        const replacement = join(dirname(written.path), "replacement.json");
        writeFileSync(replacement, `${JSON.stringify(written.document, null, 2)}\n`);
        renameSync(replacement, written.path);

        await expect(
            readIntegrationRegistryVersionManifest({
                path: written.path,
                integrationRoot,
                expectedKind: "manifest-demo",
                expectedVersion: "1.0.0",
            }),
        ).rejects.toThrow(/canonical JSON bytes/);
        await expect(
            writeIntegrationRegistryVersionManifest({
                integrationRoot: fixtureRoot(),
                package: { ...input, digest: "0".repeat(64) },
            }),
        ).rejects.toThrow(/digest does not match/);
    });
});

function fixtureRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-manifest-"));
    roots.push(root);
    mkdirSync(root, { recursive: true });
    return root;
}

async function resolvedPackage(): Promise<ResolvedIntegrationPackage> {
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "manifest-demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "notes/releases/1.0.0.md",
        files: {
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    kind: "manifest-demo",
                    label: "Manifest demo",
                    version: "1.0.0",
                    inputs: [],
                }),
            },
            "notes/releases/1.0.0.md": { encoding: "utf8", content: "# Exact release notes\n" },
            "assets/ascii.svg": {
                encoding: "base64",
                content: Buffer.from("<svg/>", "ascii").toString("base64"),
            },
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}
