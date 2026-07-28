import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { decodeIntegrationPackageFile } from "../../../../core/envelope/encoding";
import type { parseIntegrationPackageEnvelope } from "../../../../core/envelope/validate";
import type { IntegrationPackageLimits } from "../../../../interfaces/envelope";
import { readIntegrationPackageFiles } from "../../directoryWalker";

export async function assertMaterializedFiles(
    root: string,
    expected: ReturnType<typeof parseIntegrationPackageEnvelope>["files"],
    limits: Readonly<IntegrationPackageLimits>,
): Promise<void> {
    const actual = await readIntegrationPackageFiles(root, limits);
    const expectedPaths = Object.keys(expected).sort();
    const actualPaths = Object.keys(actual).sort();
    if (expectedPaths.join("\0") !== actualPaths.join("\0")) {
        throw new Error("cached package root has missing or unexpected files");
    }
    for (const path of expectedPaths) {
        const expectedFile = expected[path];
        const actualFile = actual[path];
        if (
            !expectedFile ||
            !actualFile ||
            !equalBytes(decodeIntegrationPackageFile(expectedFile), decodeIntegrationPackageFile(actualFile))
        ) {
            throw new Error(`cached package file differs from its envelope: ${path}`);
        }
    }
}

export async function readBoundedDocument(path: string, maxBytes: number): Promise<Uint8Array> {
    const pathStats = await lstat(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stats = await handle.stat();
        if (!stats.isFile() || stats.dev !== pathStats.dev || stats.ino !== pathStats.ino || stats.size > maxBytes) {
            throw new Error("cached package document is not a bounded regular file");
        }
        const bytes = new Uint8Array(stats.size);
        let offset = 0;
        while (offset < bytes.byteLength) {
            const result = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
            if (result.bytesRead === 0) {
                throw new Error("cached package document ended before its declared size");
            }
            offset += result.bytesRead;
        }
        const after = await handle.stat();
        if (after.size !== stats.size || after.mtimeMs !== stats.mtimeMs || after.ctimeMs !== stats.ctimeMs) {
            throw new Error("cached package document changed while reading");
        }
        return bytes;
    } finally {
        await handle.close();
    }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
