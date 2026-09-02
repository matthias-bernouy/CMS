import { canonicalJsonBytes, sha256Hex, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import { chmod, lstat, opendir, rm, unlink } from "node:fs/promises";

export function integrationDefinition(kind = "demo", version = "1.0.0") {
    return {
        kind,
        label: "Demo integration",
        version,
        category: "tests",
        description: "Local repository fixture",
        inputs: [],
    };
}

export async function integrationPackage(kind = "demo", version = "1.0.0") {
    const definition = integrationDefinition(kind, version);
    const envelope = validateIntegrationPackageEnvelope({
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        files: {
            "definition.json": { encoding: "utf8", content: JSON.stringify(definition) },
            "assets/icon.svg": { encoding: "utf8", content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
        },
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) };
}

export async function removeReadonlyTree(root: string): Promise<void> {
    await makeOwnerWritable(root);
    await rm(root, { recursive: true, force: true });
}

async function makeOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path).catch(() => null);
    if (!metadata) {
        return;
    }
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    await chmod(path, metadata.isDirectory() ? 0o700 : 0o600);
    if (!metadata.isDirectory()) {
        return;
    }
    const entries = await opendir(path);
    for await (const entry of entries) {
        await makeOwnerWritable(`${path}/${entry.name}`);
    }
}
