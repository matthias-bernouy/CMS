import type { StorageProvider } from "../../exports/StorageProvider";
import type { Alias } from "../../interfaces/entities/Alias";
import { assertValidAliasDomain } from "../validation/alias/domain";
import { applyAliasChanges } from "../nginx/applyAliasChanges";

export type CreateAliasDto = {
    domain:   string;
    bucketId: string;
};

/**
 * Adds a custom domain pointing at a bucket. The TLS cert at
 * `aliasCertPath(domain)` MUST exist before this call — otherwise the
 * `nginx -s reload` triggered at the end fails and the alias is rolled back
 * (best-effort).
 */
export async function createAlias(provider: StorageProvider, dto: CreateAliasDto): Promise<Alias> {
    const domain = dto.domain.toLowerCase();
    assertValidAliasDomain(domain);

    const bucket = await provider.bucketRepo.get(dto.bucketId);
    if (!bucket) throw new Error(`Bucket "${dto.bucketId}" not found.`);

    const existing = await provider.aliasRepo.getByDomain(domain);
    if (existing) throw new Error(`Alias "${domain}" already exists (points to bucket "${existing.bucketId}").`);

    const alias: Alias = {
        domain,
        bucketId:  dto.bucketId,
        createdAt: new Date(),
    };
    await provider.aliasRepo.create(alias);
    try {
        await applyAliasChanges(provider);
    } catch (err) {
        await provider.aliasRepo.delete(domain).catch(() => {});
        throw err;
    }
    return alias;
}
