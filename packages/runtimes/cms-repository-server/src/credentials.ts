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

export function assertDistinctRepositoryCredentials(managementToken: string, maintenanceToken: string): void {
    const managementDigest = createHash("sha256").update(managementToken, "utf8").digest();
    const maintenanceDigest = createHash("sha256").update(maintenanceToken, "utf8").digest();
    if (timingSafeEqual(managementDigest, maintenanceDigest)) {
        throw new RepositoryCredentialTokenFileError("Repository management and maintenance tokens must be distinct");
    }
}

async function readRepositoryCredentialToken(path: string, capability: "management" | "maintenance"): Promise<string> {
    const fileError = `Repository ${capability} token file must be a bounded regular file`;
    const contentError = `Repository ${capability} token file must contain one non-empty Bearer token`;
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
