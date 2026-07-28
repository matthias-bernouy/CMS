import { constants } from "node:fs";
import { open } from "node:fs/promises";

const MAX_TOKEN_BYTES = 8_192;
const MAX_KEY_BYTES = 32_768;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export class IntegrationVerifierCredentialError extends Error {
    override readonly name = "IntegrationVerifierCredentialError";
}

export async function readIntegrationVerifierWorkerToken(path: string): Promise<string> {
    const token = (await readBoundedCredentialFile(path, MAX_TOKEN_BYTES, "worker-token")).trim();
    if (!token || /\s/u.test(token)) {
        throw new IntegrationVerifierCredentialError(
            "Integration verifier worker-token file must contain one non-empty Bearer token",
        );
    }
    return token;
}

export async function readIntegrationVerifierKey(path: string, label: string): Promise<string> {
    const value = await readBoundedCredentialFile(path, MAX_KEY_BYTES, label);
    if (!value.trim()) {
        throw new IntegrationVerifierCredentialError(`Integration verifier ${label} file must not be empty`);
    }
    return value;
}

async function readBoundedCredentialFile(path: string, limit: number, label: string): Promise<string> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > limit) {
            throw invalidFile(label);
        }
        const bytes = new Uint8Array(limit + 1);
        let length = 0;
        while (length < bytes.byteLength) {
            const read = await handle.read(bytes, length, bytes.byteLength - length, length);
            if (read.bytesRead === 0) {
                break;
            }
            length += read.bytesRead;
        }
        if (length > limit) {
            throw invalidFile(label);
        }
        return utf8.decode(bytes.subarray(0, length));
    } catch (error) {
        if (error instanceof IntegrationVerifierCredentialError) {
            throw error;
        }
        throw invalidFile(label);
    } finally {
        await handle?.close();
    }
}

function invalidFile(label: string): IntegrationVerifierCredentialError {
    return new IntegrationVerifierCredentialError(
        `Integration verifier ${label} file must be a bounded regular file without symlink traversal`,
    );
}
