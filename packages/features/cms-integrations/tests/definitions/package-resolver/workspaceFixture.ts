import { chmod, lstat, mkdir, mkdtemp, opendir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { decodeIntegrationPackageFile, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";

export type ResolverWorkspace = {
    root: string;
    cacheRoot: string;
};

export async function temporaryResolverWorkspace(cleanup: string[]): Promise<ResolverWorkspace> {
    const root = await mkdtemp(join(tmpdir(), "cms-package-resolver-"));
    cleanup.push(root);
    return { root, cacheRoot: join(root, "cache") };
}

export async function writePackageDirectory(
    workspace: ResolverWorkspace,
    input: ResolvedIntegrationPackage,
): Promise<string> {
    const packageRoot = join(workspace.root, "embedded", input.envelope.kind, input.envelope.version);
    for (const [path, file] of Object.entries(input.envelope.files)) {
        const destination = join(packageRoot, path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, decodeIntegrationPackageFile(file));
    }
    return packageRoot;
}

export async function cleanupResolverWorkspaces(cleanup: string[]): Promise<void> {
    await Promise.all(
        cleanup.splice(0).map(async (root) => {
            await makeOwnerWritable(root);
            await rm(root, { recursive: true, force: true });
        }),
    );
}

async function makeOwnerWritable(path: string): Promise<void> {
    let metadata;
    try {
        metadata = await lstat(path);
    } catch (error) {
        if (isMissing(error)) {
            return;
        }
        throw error;
    }
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

function isMissing(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
