import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { assertExactIntegrationVersion } from "@bernouy/cms-integrations";

export const INTEGRATION_REGISTRY_INTERNAL_DIRECTORY = ".registry";
export const INTEGRATION_REGISTRY_MANIFEST_DIRECTORY = "manifests";

export function integrationRegistryVersionManifestPath(integrationRoot: string, version: string): string {
    assertExactIntegrationVersion(version, "version");
    return join(
        integrationRoot,
        INTEGRATION_REGISTRY_INTERNAL_DIRECTORY,
        INTEGRATION_REGISTRY_MANIFEST_DIRECTORY,
        `${version}.json`,
    );
}

export async function ensureIntegrationRegistryManifestDirectory(integrationRoot: string): Promise<string> {
    const rootMetadata = await lstat(integrationRoot);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
        throw new Error("Integration root must be a non-symlink directory");
    }
    const root = await realpath(integrationRoot);
    assertSameEntry(rootMetadata, await lstat(root), "integration root");
    const internal = await ensureDirectory(root, INTEGRATION_REGISTRY_INTERNAL_DIRECTORY, root);
    return await ensureDirectory(internal, INTEGRATION_REGISTRY_MANIFEST_DIRECTORY, root);
}

async function ensureDirectory(parent: string, name: string, root: string): Promise<string> {
    const path = join(parent, name);
    try {
        await mkdir(path, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Integration registry manifest path must be a non-symlink directory: ${path}`);
    }
    const canonical = await realpath(path);
    assertWithin(root, canonical);
    assertSameEntry(metadata, await lstat(canonical), "manifest directory");
    return canonical;
}

function assertWithin(root: string, target: string): void {
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error("Integration registry manifest directory escapes its integration root");
    }
}

function assertSameEntry(
    expected: Readonly<{ dev: number; ino: number }>,
    actual: Readonly<{ dev: number; ino: number }>,
    source: string,
): void {
    if (expected.dev !== actual.dev || expected.ino !== actual.ino) {
        throw new Error(`Integration registry ${source} changed while resolving manifests`);
    }
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
