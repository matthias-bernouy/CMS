import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { IntegrationPackageLimits } from "../../interfaces/envelope";

const READ_CHUNK_BYTES = 64 * 1024;

export async function readBoundedRegularFile(
    path: string,
    packageBytes: number,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<Uint8Array> {
    const pathStats = await lstat(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const handleStats = await handle.stat();
        assertSameFile(pathStats, handleStats, path);
        const bytes = await readBoundedFileHandle(handle, path, packageBytes, limits);
        assertSameFile(handleStats, await handle.stat(), path);
        assertSameFile(handleStats, await lstat(path), path);
        return bytes;
    } finally {
        await handle.close();
    }
}

type BoundedFileHandle = Pick<Awaited<ReturnType<typeof open>>, "read" | "stat">;

export async function readBoundedFileHandle(
    handle: BoundedFileHandle,
    path: string,
    packageBytes: number,
    limits: Readonly<IntegrationPackageLimits>,
): Promise<Uint8Array> {
    const stats = await handle.stat();
    if (!stats.isFile()) {
        throw new Error(`Integration package entry must be a regular file: ${path}`);
    }
    assertDeclaredSize(path, stats.size, packageBytes, limits);

    const chunks: Uint8Array[] = [];
    let fileBytes = 0;
    while (true) {
        const remainingFileBytes = limits.maxFileBytes - fileBytes;
        const remainingPackageBytes = limits.maxDecodedBytes - packageBytes - fileBytes;
        const remainingBytes = Math.min(remainingFileBytes, remainingPackageBytes);
        const readSize = Math.min(READ_CHUNK_BYTES, remainingBytes + 1);
        const chunk = new Uint8Array(readSize);
        const { bytesRead } = await handle.read(chunk, 0, readSize, null);
        if (bytesRead === 0) {
            break;
        }
        fileBytes += bytesRead;
        if (fileBytes > limits.maxFileBytes) {
            throw new Error(`Integration package file exceeds ${limits.maxFileBytes} decoded bytes: ${path}`);
        }
        if (packageBytes + fileBytes > limits.maxDecodedBytes) {
            throw new Error(
                `Integration package contents exceed ${limits.maxDecodedBytes} decoded bytes while reading: ${path}`,
            );
        }
        chunks.push(chunk.subarray(0, bytesRead));
    }
    return concatenate(chunks, fileBytes);
}

function assertDeclaredSize(
    path: string,
    size: number,
    packageBytes: number,
    limits: Readonly<IntegrationPackageLimits>,
): void {
    if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`Integration package file has an unsupported size: ${path}`);
    }
    if (size > limits.maxFileBytes) {
        throw new Error(`Integration package file exceeds ${limits.maxFileBytes} decoded bytes: ${path}`);
    }
    if (packageBytes + size > limits.maxDecodedBytes) {
        throw new Error(
            `Integration package contents exceed ${limits.maxDecodedBytes} decoded bytes while reading: ${path}`,
        );
    }
}

function concatenate(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

type FileIdentity = {
    dev: number;
    ino: number;
    size: number;
    mtimeMs: number;
    ctimeMs: number;
};

function assertSameFile(expected: FileIdentity, actual: FileIdentity, path: string): void {
    if (
        expected.dev !== actual.dev ||
        expected.ino !== actual.ino ||
        expected.size !== actual.size ||
        expected.mtimeMs !== actual.mtimeMs ||
        expected.ctimeMs !== actual.ctimeMs
    ) {
        throw new Error(`Integration package file changed while reading: ${path}`);
    }
}
