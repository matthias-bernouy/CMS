import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

const MAX_CREDENTIAL_TOKEN_BYTES = 8_192;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export async function readRepositoryManagementToken(path: string): Promise<string> {
    return readRepositoryCredentialToken(path, "management");
}

export async function readRepositoryMaintenanceToken(path: string): Promise<string> {
    return readRepositoryCredentialToken(path, "maintenance");
}

export async function readRepositoryWorkerToken(path: string): Promise<string> {
    return readRepositoryCredentialToken(path, "worker");
}

export async function readRepositoryWorkerCapabilitySigningKey(path: string): Promise<string> {
    const key = await readRepositoryCredentialToken(path, "worker capability");
    if (key.length < 32) {
        throw new RepositoryCredentialTokenFileError(
            "Repository worker capability signing-key file must contain at least 32 non-space characters",
        );
    }
    return key;
}

export function assertDistinctRepositoryCredentials(...credentials: readonly string[]): void {
    const digests = credentials.map((credential) => createHash("sha256").update(credential, "utf8").digest());
    for (let left = 0; left < digests.length; left += 1) {
        for (let right = left + 1; right < digests.length; right += 1) {
            if (timingSafeEqual(digests[left]!, digests[right]!)) {
                const label =
                    credentials.length === 2
                        ? "management and maintenance tokens"
                        : "management, maintenance, worker, and worker capability credentials";
                throw new RepositoryCredentialTokenFileError(`Repository ${label} must be distinct`);
            }
        }
    }
}

async function readRepositoryCredentialToken(
    path: string,
    capability: "management" | "maintenance" | "worker" | "worker capability",
): Promise<string> {
    const label = capability === "worker capability" ? "worker capability signing-key" : `${capability} token`;
    const fileError = `Repository ${label} file must be a bounded regular file`;
    const contentError =
        capability === "worker capability"
            ? `Repository ${label} file must contain one non-empty credential`
            : `Repository ${label} file must contain one non-empty Bearer token`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_CREDENTIAL_TOKEN_BYTES) {
            throw new RepositoryCredentialTokenFileError(fileError);
        }
        const bytes = new Uint8Array(MAX_CREDENTIAL_TOKEN_BYTES + 1);
        let length = 0;
        while (length < bytes.byteLength) {
            const result = await handle.read(bytes, length, bytes.byteLength - length, length);
            if (result.bytesRead === 0) {
                break;
            }
            length += result.bytesRead;
        }
        if (length > MAX_CREDENTIAL_TOKEN_BYTES) {
            throw new RepositoryCredentialTokenFileError(fileError);
        }
        const token = utf8.decode(bytes.subarray(0, length)).trim();
        if (!token || /\s/u.test(token)) {
            throw new RepositoryCredentialTokenFileError(contentError);
        }
        return token;
    } catch (error) {
        if (error instanceof RepositoryCredentialTokenFileError) {
            throw error;
        }
        throw new RepositoryCredentialTokenFileError(fileError);
    } finally {
        await handle?.close();
    }
}

class RepositoryCredentialTokenFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RepositoryCredentialTokenFileError";
    }
}
