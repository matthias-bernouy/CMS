import { canonicalJsonBytes, sha256Hex, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import { chmod, lstat, mkdir, opendir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function integrationDefinition(kind = "demo", version = "1.0.0", overrides: Record<string, unknown> = {}) {
    return {
        kind,
        label: "Demo integration",
        version,
        category: "tests",
        description: "Local repository fixture",
        inputs: [],
        ...overrides,
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

export async function writeIntegrationSource(root: string, version = "1.0.0"): Promise<string> {
    const versionRoot = join(root, "integrations", "demo", "versions", version);
    await mkdir(versionRoot, { recursive: true });
    await writeFile(
        join(root, "integrations", "demo", "integration.json"),
        JSON.stringify({
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Demo",
            latest: version,
            stable: version,
            versions: [{ version, path: `versions/${version}`, definition: `versions/${version}/definition.json` }],
        }),
    );
    const definitionPath = join(versionRoot, "definition.json");
    await writeFile(definitionPath, JSON.stringify(integrationDefinition("demo", version)));
    await writeFile(join(versionRoot, "release-notes.txt"), "Initial local release.\n");
    return definitionPath;
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
