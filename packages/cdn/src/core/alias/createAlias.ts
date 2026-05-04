import type { StorageProvider } from "../../exports/StorageProvider";
import type { Alias } from "../../interfaces/entities/Alias";
import { assertValidAliasDomain } from "../validation/alias/domain";
import { applyAliasChanges } from "../nginx/applyAliasChanges";
import { issueLegoCert } from "./issueLegoCert";

export type CreateAliasDto = {
    domain:   string;
    bucketId: string;
    /** When `true`, run `lego` against `provider.config.aliasIssuer` BEFORE
     *  writing the alias row. Skip when the cert is already on disk
     *  (manual workflow / managed by an external process). */
    issueCert?: boolean;
};

/**
 * Adds a custom domain pointing at a bucket. Effect order:
 *   1. validate domain + bucket
 *   2. (optional) issue cert via lego — failure aborts cleanly, no rollback needed
 *   3. write DB row
 *   4. regen nginx fragments + reload — failure rolls back the DB row but
 *      leaves the cert on disk (re-running with the same domain reuses it).
 */
export async function createAlias(provider: StorageProvider, dto: CreateAliasDto): Promise<Alias> {
    const domain = dto.domain.toLowerCase();
    assertValidAliasDomain(domain);

    const bucket = await provider.bucketRepo.get(dto.bucketId);
    if (!bucket) throw new Error(`Bucket "${dto.bucketId}" not found.`);

    const existing = await provider.aliasRepo.getByDomain(domain);
    if (existing) throw new Error(`Alias "${domain}" already exists (points to bucket "${existing.bucketId}").`);

    if (dto.issueCert) {
        const issuer = provider.config.aliasIssuer;
        if (!issuer) throw new Error("issueCert requested but provider.config.aliasIssuer is not configured.");
        await issueLegoCert(domain, issuer);
    }

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
