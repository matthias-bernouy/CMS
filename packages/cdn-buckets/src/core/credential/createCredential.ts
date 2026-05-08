import { sha256Hex, generateBearerToken } from "@bernouy/core";

import type { StorageProvider } from "../../exports/StorageProvider";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";
import type { CredentialCreateDto } from "../validation/credential/parseCreateDto";
import { generateId } from "../ids";

/**
 * The cleartext is returned only by this function; once persisted we keep
 * just the hash. Caller (the API endpoint) is the only place where the
 * cleartext crosses a process boundary — back to the user via the response.
 */
export type CreatedCredential = {
    credential: BucketCredential;
    cleartextToken: string;
};

export async function createCredential(
    provider: StorageProvider,
    bucketId: string,
    dto: CredentialCreateDto,
): Promise<CreatedCredential> {
    const bucket = await provider.bucketRepo.get(bucketId);
    if (!bucket) throw new Error(`Bucket "${bucketId}" not found.`);

    const cleartextToken = generateBearerToken("bsp_");
    const tokenHash = await sha256Hex(cleartextToken);

    const credential: BucketCredential = {
        id:        generateId(),
        bucketId,
        tokenHash,
        createdAt: new Date(),
        ...(dto.label     !== undefined ? { label:     dto.label     } : {}),
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt } : {}),
    };

    await provider.bucketCredentialRepo.create(credential);
    return { credential, cleartextToken };
}
