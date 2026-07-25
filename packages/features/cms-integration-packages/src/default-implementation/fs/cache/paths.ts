import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

export type IntegrationPackageCacheLayout = {
    root: string;
    objects: string;
    staging: string;
    corrupt: string;
    locks: string;
};

export async function initializeCacheLayout(requestedRoot: string): Promise<IntegrationPackageCacheLayout> {
    await mkdir(requestedRoot, { recursive: true, mode: 0o750 });
    const root = await realpath(requestedRoot);
    const rootStats = await stat(root);
    if (!rootStats.isDirectory()) {
        throw new Error("Integration package cache root must be a directory");
    }
    const layout = {
        root,
        objects: join(root, "objects", "sha256"),
        staging: join(root, ".staging"),
        corrupt: join(root, ".corrupt"),
        locks: join(root, ".locks"),
    };
    const objectsParent = join(root, "objects");
    await ensureOwnedDirectory(root, objectsParent);
    await ensureOwnedDirectory(objectsParent, layout.objects);
    await Promise.all([
        ensureOwnedDirectory(root, layout.staging),
        ensureOwnedDirectory(root, layout.corrupt),
        ensureOwnedDirectory(root, layout.locks),
    ]);
    const filesystemEntries = await Promise.all(
        [layout.objects, layout.staging, layout.corrupt, layout.locks].map(async (path) => ({
            path,
            metadata: await stat(path),
        })),
    );
    const filesystemDevice = filesystemEntries[0]!.metadata.dev;
    const separateFilesystem = filesystemEntries.find(({ metadata }) => metadata.dev !== filesystemDevice);
    if (separateFilesystem) {
        throw new Error(`Integration package cache path must share the objects filesystem: ${separateFilesystem.path}`);
    }
    return layout;
}

export function assertPackageDigest(digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
        throw new TypeError("Integration package digest must be lowercase hexadecimal SHA-256");
    }
    return digest;
}

export function objectPath(layout: IntegrationPackageCacheLayout, digest: string): string {
    return join(layout.objects, assertPackageDigest(digest));
}

export function assertWithinCache(root: string, path: string): void {
    const suffix = relative(root, path);
    if (suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) {
        throw new Error("Integration package cache path escapes its root");
    }
}

export function isMissing(error: unknown): boolean {
    return errorCode(error) === "ENOENT";
}

export function isRenameConflict(error: unknown): boolean {
    const code = errorCode(error);
    return code === "EEXIST" || code === "ENOTEMPTY";
}

export function errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
}

async function ensureOwnedDirectory(parent: string, path: string): Promise<void> {
    if (dirname(path) !== parent) {
        throw new Error("Integration package cache directories must be created one level at a time");
    }
    assertWithinCache(parent, path);
    try {
        await mkdir(path, { mode: 0o750 });
    } catch (error) {
        if (errorCode(error) !== "EEXIST") {
            throw error;
        }
    }
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new Error(`Integration package cache path must be a real directory: ${path}`);
    }
    assertWithinCache(parent, await realpath(path));
}
