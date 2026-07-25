import { constants } from "node:fs";
import { chmod, open } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import { resolveIntegrationPackageLimits } from "../../../core/envelope/constants";
import { decodeIntegrationPackageFile } from "../../../core/envelope/encoding";
import type { IntegrationPackageLimits } from "../../../interfaces/envelope";
import type { PreparedIntegrationPackage } from "./prepare";
import {
    assertOwnedDirectory,
    createOwnedChildDirectory,
    syncDirectory,
    type OwnedDirectory,
    type StagingDirectory,
} from "./paths";

export async function writePackageFiles(
    staging: StagingDirectory,
    input: PreparedIntegrationPackage,
    limitsInput: Partial<IntegrationPackageLimits> | undefined,
    hooks: IntegrationPackageDirectoryWriteHooks = {},
): Promise<void> {
    const limits = resolveIntegrationPackageLimits(limitsInput);
    const directories = new Map<string, OwnedDirectory>([["", staging.root]]);
    for (const directoryPath of requiredDirectoryPaths(input).sort(compareDirectoryPaths)) {
        const parentPath = dirname(directoryPath) === "." ? "" : dirname(directoryPath);
        const parent = directories.get(parentPath);
        if (!parent) {
            throw new Error(`Integration package parent directory is missing: ${parentPath}`);
        }
        directories.set(directoryPath, await createOwnedChildDirectory(staging, parent, directoryPath));
    }

    let writtenBytes = 0;
    for (const [packagePath, file] of Object.entries(input.envelope.files).sort(compareFilePaths)) {
        const parentPath = dirname(packagePath) === "." ? "" : dirname(packagePath);
        const parent = directories.get(parentPath);
        if (!parent) {
            throw new Error(`Integration package parent directory is missing: ${parentPath}`);
        }
        const bytes = decodeIntegrationPackageFile(file);
        writtenBytes += bytes.byteLength;
        if (bytes.byteLength > limits.maxFileBytes || writtenBytes > limits.maxDecodedBytes) {
            throw new Error("Integration package actual writes exceed configured decoded byte limits");
        }
        await writeDurableFile(staging, parent, packagePath, bytes, hooks);
    }

    for (const directory of [...directories.entries()].sort(deepestFirst)) {
        await assertOwnedDirectory(directory[1], "package directory");
        await chmod(directory[1].path, 0o550);
        await syncDirectory(directory[1].path);
    }
    await assertOwnedDirectory(staging.parent, "staging parent");
    await syncDirectory(staging.parent.path);
}

export type IntegrationPackageDirectoryWriteHooks = {
    afterFileCreated?(packagePath: string): void | Promise<void>;
};

async function writeDurableFile(
    staging: StagingDirectory,
    parent: OwnedDirectory,
    packagePath: string,
    bytes: Uint8Array,
    hooks: IntegrationPackageDirectoryWriteHooks,
): Promise<void> {
    await assertOwnedDirectory(parent, "package file parent");
    const name = packagePath.split("/").at(-1)!;
    const destination = `${parent.path}${sep}${name}`;
    if (dirname(destination) !== parent.path || relative(parent.path, destination) !== name) {
        throw new Error("Integration package file changed confinement");
    }
    const handle = await open(
        destination,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        0o640,
    );
    try {
        const before = await handle.stat();
        if (!before.isFile()) {
            throw new Error(`Integration package destination is not a regular file: ${name}`);
        }
        staging.entries.set(packagePath, { path: destination, metadata: before, type: "file" });
        await hooks.afterFileCreated?.(packagePath);
        await handle.writeFile(bytes);
        const after = await handle.stat();
        if (
            !after.isFile() ||
            after.dev !== before.dev ||
            after.ino !== before.ino ||
            after.size !== bytes.byteLength
        ) {
            throw new Error(`Integration package file write could not be verified: ${name}`);
        }
        await handle.chmod(0o440);
        await handle.sync();
    } finally {
        await handle.close();
    }
    await assertOwnedDirectory(parent, "package file parent");
}

function requiredDirectoryPaths(input: PreparedIntegrationPackage): string[] {
    const directories = new Set<string>();
    for (const filePath of Object.keys(input.envelope.files)) {
        const segments = filePath.split("/");
        for (let length = 1; length < segments.length; length += 1) {
            directories.add(segments.slice(0, length).join("/"));
        }
    }
    return [...directories];
}

function compareDirectoryPaths(left: string, right: string): number {
    const depthDifference = left.split("/").length - right.split("/").length;
    return depthDifference || compareText(left, right);
}

function compareFilePaths(left: [string, unknown], right: [string, unknown]): number {
    return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
}

function deepestFirst(left: [string, unknown], right: [string, unknown]): number {
    const depthDifference = pathDepth(right[0]) - pathDepth(left[0]);
    return depthDifference || compareText(right[0], left[0]);
}

function pathDepth(path: string): number {
    return path ? path.split("/").length : 0;
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
