import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export async function readCanonicalJsonFile(path: string, maxBytes: number): Promise<unknown | null> {
    const result = await readJsonFile(path, maxBytes);
    if (result === null) {
        return null;
    }
    if (!equalBytes(result.bytes, canonicalJsonBytes(result.value))) {
        throw new Error(`Registry document is not canonical JSON: ${path}`);
    }
    return result.value;
}

export async function readJsonFile(
    path: string,
    maxBytes: number,
): Promise<Readonly<{ value: unknown; bytes: Uint8Array }> | null> {
    let bytes: Uint8Array;
    try {
        bytes = await readStableFile(path, maxBytes);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
    let value: unknown;
    try {
        value = JSON.parse(utf8.decode(bytes));
    } catch (error) {
        throw new Error(`Invalid canonical registry JSON at ${path}: ${errorMessage(error)}`);
    }
    return { value, bytes };
}

export async function writeCanonicalJsonNoReplace(path: string, value: unknown, maxBytes: number): Promise<void> {
    const bytes = boundedCanonicalBytes(value, maxBytes);
    const temporary = await writeTemporary(path, bytes);
    try {
        await link(temporary, path);
        await syncDirectory(dirname(path));
    } finally {
        await removeFileIfExists(temporary);
        await syncDirectory(dirname(path));
    }
}

export async function replaceCanonicalJson(path: string, value: unknown, maxBytes: number): Promise<void> {
    const temporary = await writeTemporary(path, boundedCanonicalBytes(value, maxBytes));
    try {
        await rename(temporary, path);
        await syncDirectory(dirname(path));
    } finally {
        await removeFileIfExists(temporary);
    }
}

export async function removeFileIfExists(path: string): Promise<void> {
    try {
        await unlink(path);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
            throw error;
        }
    }
}

export async function syncDirectory(path: string): Promise<void> {
    const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

function boundedCanonicalBytes(value: unknown, maxBytes: number): Uint8Array {
    const bytes = canonicalJsonBytes(value);
    if (bytes.byteLength > maxBytes) {
        throw new Error(`Canonical registry document exceeds ${maxBytes} bytes`);
    }
    return bytes;
}

async function writeTemporary(path: string, bytes: Uint8Array): Promise<string> {
    const parent = dirname(path);
    const canonicalParent = await realpath(parent);
    if (canonicalParent !== parent) {
        throw new Error(`Registry document parent must not traverse symlinks: ${parent}`);
    }
    const temporary = join(parent, `.${randomUUID()}.tmp`);
    try {
        const handle = await open(
            temporary,
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
            0o640,
        );
        try {
            await handle.writeFile(bytes);
            const metadata = await handle.stat();
            if (!metadata.isFile() || metadata.size !== bytes.byteLength) {
                throw new Error(`Registry document temporary write could not be verified: ${path}`);
            }
            await handle.chmod(0o440);
            await handle.sync();
        } finally {
            await handle.close();
        }
        return temporary;
    } catch (error) {
        await removeFileIfExists(temporary);
        throw error;
    }
}

async function readStableFile(path: string, maxBytes: number): Promise<Uint8Array> {
    const pathMetadata = await lstat(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const metadata = await handle.stat();
        assertSameFile(pathMetadata, metadata, path);
        if (!metadata.isFile() || metadata.size > maxBytes) {
            throw new Error(`Registry document exceeds ${maxBytes} bytes: ${path}`);
        }
        const bytes = new Uint8Array(metadata.size);
        let offset = 0;
        while (offset < bytes.byteLength) {
            const result = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
            if (result.bytesRead === 0) {
                throw new Error(`Registry document ended before its declared size: ${path}`);
            }
            offset += result.bytesRead;
        }
        if (offset > maxBytes) {
            throw new Error(`Registry document exceeds ${maxBytes} bytes: ${path}`);
        }
        assertSameFile(metadata, await handle.stat(), path);
        assertSameFile(metadata, await lstat(path), path);
        return bytes;
    } finally {
        await handle.close();
    }
}

function assertSameFile(
    expected: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>,
    actual: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>,
    path: string,
): void {
    if (
        expected.dev !== actual.dev ||
        expected.ino !== actual.ino ||
        expected.size !== actual.size ||
        expected.mtimeMs !== actual.mtimeMs ||
        expected.ctimeMs !== actual.ctimeMs
    ) {
        throw new Error(`Registry document changed while reading: ${path}`);
    }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

function errorMessage(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
}
