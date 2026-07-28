import { chmod, lstat, mkdtemp, opendir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    validateIntegrationPackageEnvelope,
    type IntegrationPackageEnvelopeV1,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";

export async function resolvedPackage(
    overrides: Partial<IntegrationPackageEnvelopeV1> = {},
): Promise<ResolvedIntegrationPackage> {
    const envelope = validateIntegrationPackageEnvelope({
        schema: "cms.integration.package.v1",
        kind: "cache-demo",
        version: "1.0.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: '{"kind":"cache-demo","version":"1.0.0"}' },
            "release-notes.md": { encoding: "utf8", content: "# Release\n" },
            "assets/payload.bin": { encoding: "base64", content: "AAECAw==" },
        },
        ...overrides,
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export async function temporaryCacheRoot(cleanup: string[]): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-integration-cache-"));
    cleanup.push(root);
    return root;
}

export async function cleanupRoots(cleanup: string[]): Promise<void> {
    await Promise.all(
        cleanup.splice(0).map(async (root) => {
            await makeOwnerWritable(root);
            await rm(root, { recursive: true, force: true });
        }),
    );
}

async function makeOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    if (!metadata.isDirectory()) {
        await chmod(path, 0o600);
        return;
    }
    await chmod(path, 0o700);
    const handle = await opendir(path);
    for await (const entry of handle) {
        await makeOwnerWritable(join(path, entry.name));
    }
}
