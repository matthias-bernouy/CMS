import type { StorageProvider } from "../../exports/StorageProvider";
import type { BucketCredential } from "../../interfaces/entities/BucketCredential";
import type { CredentialUpdateDto } from "../validation/credential/parseUpdateDto";

export async function updateCredential(
    provider: StorageProvider,
    id: string,
    bucketId: string | null,
    dto: CredentialUpdateDto,
): Promise<BucketCredential> {
    const existing = await provider.bucketCredentialRepo.get(id);
    if (!existing) throw new Error(`Credential "${id}" not found.`);
    if (bucketId !== null && existing.bucketId !== bucketId) {
        throw new Error("Credential does not belong to the requested bucket.");
    }

    await provider.bucketCredentialRepo.update(id, dto);
    return { ...existing, ...dto };
}
