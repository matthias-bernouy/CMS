import type { StorageProvider } from "../../exports/StorageProvider";

export async function deleteCredential(
    provider: StorageProvider,
    id: string,
    bucketId: string | null,
): Promise<void> {
    const existing = await provider.bucketCredentialRepo.get(id);
    if (!existing) throw new Error(`Credential "${id}" not found.`);
    if (bucketId !== null && existing.bucketId !== bucketId) {
        throw new Error("Credential does not belong to the requested bucket.");
    }

    await provider.bucketCredentialRepo.delete(id);
}
