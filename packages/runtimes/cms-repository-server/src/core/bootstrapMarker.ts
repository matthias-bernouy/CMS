import { constants, type Stats } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { join } from "node:path";

export const REPOSITORY_BOOTSTRAP_MARKER = ".official-bootstrap-in-progress";
const MARKER_SCHEMA = "cms.integration.repository.bootstrap.v2";
const MARKER_STATE = "commit-pending";
const MARKER_MAX_BYTES = 512;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

export class RepositoryRegistryBootstrapIncompleteError extends Error {
    constructor() {
        super("Integration repository bootstrap cannot be resumed safely and requires operator recovery");
        this.name = "RepositoryRegistryBootstrapIncompleteError";
    }
}

type RepositoryBootstrapMarkerV2 = Readonly<{
    planDigest: string;
    schema: typeof MARKER_SCHEMA;
    state: typeof MARKER_STATE;
}>;

export function assertBootstrapPlanDigest(planDigest: string): void {
    if (!SHA256_HEX.test(planDigest)) {
        throw new TypeError("Integration repository bootstrap preparation is invalid");
    }
}

export async function writeRepositoryBootstrapMarker(root: string, planDigest: string): Promise<void> {
    let marker;
    try {
        marker = await open(
            join(root, REPOSITORY_BOOTSTRAP_MARKER),
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
            0o600,
        );
    } catch (error) {
        if (isFileSystemError(error, "EEXIST")) {
            throw new RepositoryRegistryBootstrapIncompleteError();
        }
        throw error;
    }
    try {
        await marker.writeFile(markerBytes(planDigest));
        await marker.sync();
    } finally {
        await marker.close();
    }
    await syncDirectory(root);
}

export async function readRepositoryBootstrapMarker(root: string): Promise<RepositoryBootstrapMarkerV2> {
    let handle;
    try {
        handle = await open(
            join(root, REPOSITORY_BOOTSTRAP_MARKER),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const metadataBeforeRead = await handle.stat();
        if (!metadataBeforeRead.isFile() || metadataBeforeRead.size < 1 || metadataBeforeRead.size > MARKER_MAX_BYTES) {
            throw new RepositoryRegistryBootstrapIncompleteError();
        }
        const bytes = await readBounded(handle);
        const metadataAfterRead = await handle.stat();
        if (bytes.byteLength !== metadataBeforeRead.size || !sameStableFile(metadataBeforeRead, metadataAfterRead)) {
            throw new RepositoryRegistryBootstrapIncompleteError();
        }
        const value: unknown = JSON.parse(strictUtf8.decode(bytes));
        if (!isRepositoryBootstrapMarker(value) || !equalBytes(bytes, markerBytes(value.planDigest))) {
            throw new RepositoryRegistryBootstrapIncompleteError();
        }
        return value;
    } catch (error) {
        if (error instanceof RepositoryRegistryBootstrapIncompleteError) {
            throw error;
        }
        throw new RepositoryRegistryBootstrapIncompleteError();
    } finally {
        await handle?.close();
    }
}

export async function removeRepositoryBootstrapMarker(root: string, planDigest: string): Promise<void> {
    const marker = await readRepositoryBootstrapMarker(root);
    if (marker.planDigest !== planDigest) {
        throw new RepositoryRegistryBootstrapIncompleteError();
    }
    await unlink(join(root, REPOSITORY_BOOTSTRAP_MARKER));
    await syncDirectory(root);
}

async function readBounded(handle: Awaited<ReturnType<typeof open>>): Promise<Uint8Array> {
    const bytes = new Uint8Array(MARKER_MAX_BYTES + 1);
    let offset = 0;
    while (offset < bytes.byteLength) {
        const result = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
        if (result.bytesRead === 0) {
            break;
        }
        offset += result.bytesRead;
    }
    if (offset > MARKER_MAX_BYTES) {
        throw new RepositoryRegistryBootstrapIncompleteError();
    }
    return bytes.subarray(0, offset);
}

function markerBytes(planDigest: string): Uint8Array {
    return utf8.encode(JSON.stringify({ planDigest, schema: MARKER_SCHEMA, state: MARKER_STATE }));
}

function isRepositoryBootstrapMarker(value: unknown): value is RepositoryBootstrapMarkerV2 {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    return (
        keys.length === 3 &&
        keys.includes("planDigest") &&
        keys.includes("schema") &&
        keys.includes("state") &&
        typeof record.planDigest === "string" &&
        SHA256_HEX.test(record.planDigest) &&
        record.schema === MARKER_SCHEMA &&
        record.state === MARKER_STATE
    );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function sameStableFile(before: Stats, after: Stats): boolean {
    return (
        before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        before.ctimeMs === after.ctimeMs
    );
}

function isFileSystemError(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
}

async function syncDirectory(path: string): Promise<void> {
    const directory = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}
