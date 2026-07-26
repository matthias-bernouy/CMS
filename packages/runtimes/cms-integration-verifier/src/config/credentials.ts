import { constants } from "node:fs";
import { open } from "node:fs/promises";

const MAX_TOKEN_BYTES = 8_192;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export class IntegrationVerifierCredentialError extends Error {
    override readonly name = "IntegrationVerifierCredentialError";
}

export async function readIntegrationVerifierWorkerToken(path: string): Promise<string> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stats = await handle.stat();
        if (!stats.isFile() || stats.size > MAX_TOKEN_BYTES) {
            throw invalidFile();
        }
        const bytes = new Uint8Array(MAX_TOKEN_BYTES + 1);
        let length = 0;
        while (length < bytes.byteLength) {
            const read = await handle.read(bytes, length, bytes.byteLength - length, length);
            if (read.bytesRead === 0) {
                break;
            }
            length += read.bytesRead;
        }
        if (length > MAX_TOKEN_BYTES) {
            throw invalidFile();
        }
        const token = utf8.decode(bytes.subarray(0, length)).trim();
        if (!token || /\s/u.test(token)) {
            throw new IntegrationVerifierCredentialError(
                "Integration verifier worker-token file must contain one non-empty Bearer token",
            );
        }
        return token;
    } catch (error) {
        if (error instanceof IntegrationVerifierCredentialError) {
            throw error;
        }
        throw invalidFile();
    } finally {
        await handle?.close();
    }
}

function invalidFile(): IntegrationVerifierCredentialError {
    return new IntegrationVerifierCredentialError(
        "Integration verifier worker-token file must be a bounded regular file without symlink traversal",
    );
}
