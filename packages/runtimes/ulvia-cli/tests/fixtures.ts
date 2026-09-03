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
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: JSON.stringify(definition) },
            "release-notes.md": { encoding: "utf8", content: "Initial release.\n" },
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

export async function writeIntegrationSource(root: string, version = "1.0.0", kind = "demo"): Promise<string> {
    const versionRoot = join(root, "integrations", kind, "versions", version);
    await mkdir(versionRoot, { recursive: true });
    await writeFile(
        join(root, "integrations", kind, "integration.json"),
        JSON.stringify({
            schema: "cms.integration.index.v1",
            kind,
            label: "Demo",
            latest: version,
            stable: version,
            versions: [{ version, path: `versions/${version}`, definition: `versions/${version}/definition.json` }],
        }),
    );
    const definitionPath = join(versionRoot, "definition.json");
    await writeFile(definitionPath, JSON.stringify(integrationDefinition(kind, version)));
    await writeFile(join(versionRoot, "release-notes.txt"), "Initial local release.\n");
    return definitionPath;
}

export async function writeDirectIntegrationSource(root: string, version = "2.0.0", kind = "demo"): Promise<string> {
    const integrationRoot = join(root, "integrations", kind);
    await mkdir(join(integrationRoot, "tests", "checks"), { recursive: true });
    await writeFile(
        join(integrationRoot, "integration.json"),
        JSON.stringify({
            schema: "cms.integration.index.v1",
            kind,
            label: "Demo",
            latest: version,
            stable: version,
            versions: [{ version, path: ".", definition: "definition.json" }],
        }),
    );
    const definitionPath = join(integrationRoot, "definition.json");
    await writeFile(definitionPath, JSON.stringify(integrationDefinition(kind, version)));
    await writeFile(join(integrationRoot, "release-notes.txt"), "Direct source release.\n");
    await writeFile(join(integrationRoot, "tests", "checks", "runtime.test.ts"), "throw new Error('not runtime');\n");
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
