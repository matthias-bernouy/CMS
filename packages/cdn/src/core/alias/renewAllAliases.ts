import type { StorageProvider } from "../../exports/StorageProvider";
import { renewLegoCert } from "./issueLegoCert";
import { reload } from "../nginx/reload";

export type RenewSummary = {
    renewed: number;
    failed:  { domain: string; error: string }[];
};

/**
 * Iterates over every registered alias and runs `lego renew` for it. Lego
 * is a no-op when the cert is still fresh, so this can be called on a
 * cron without burning ACME quota. Nginx is reloaded once at the end if
 * any cert was actually renewed (and at least one lego run succeeded).
 */
export async function renewAllAliases(provider: StorageProvider): Promise<RenewSummary> {
    const issuer = provider.config.aliasIssuer;
    if (!issuer) throw new Error("provider.config.aliasIssuer is not configured.");

    const aliases = await provider.aliasRepo.list();
    const summary: RenewSummary = { renewed: 0, failed: [] };
    for (const alias of aliases) {
        try {
            await renewLegoCert(alias.domain, issuer);
            summary.renewed++;
        } catch (err) {
            summary.failed.push({
                domain: alias.domain,
                error:  err instanceof Error ? err.message : String(err),
            });
        }
    }
    if (summary.renewed > 0 && provider.config.nginx?.binary !== undefined) {
        await reload(provider.config.nginx.binary);
    }
    return summary;
}
