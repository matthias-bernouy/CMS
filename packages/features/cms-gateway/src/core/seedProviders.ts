import type { GatewayRepository } from "../interfaces/GatewayRepository";
import type { Provider } from "../interfaces/Gateway";
import { validateProvider } from "./validateProvider";

export type SeedResult = { created: string[]; skipped: string[] };

/**
 * Loads a provider manifest into the repo. **Idempotent**: if the urn
 * already exists it is skipped (no update — the repo does not yet have
 * `update`/`delete`, so editing an already-stored provider requires a wipe).
 *
 * Two passes:
 *   1. validate the ENTIRE manifest (`validateProvider` + unique urns) and throw
 *      **before** touching the store if anything is wrong (fail fast,
 *      no partial seed);
 *   2. create, skipping providers that are already present.
 *
 * Uses only the `GatewayRepository` INTERFACE (injection) — no impl.
 */
export async function seedProviders(
    repo: GatewayRepository,
    providers: Provider[],
): Promise<SeedResult> {
    // 1) Validation — nothing created if the manifest is invalid.
    const problems: string[] = [];

    const urns = providers.map(p => p.urn);
    const dupes = [...new Set(urns.filter((u, i) => urns.indexOf(u) !== i))];
    if (dupes.length > 0) problems.push(`urns de provider dupliqués : ${dupes.join(", ")}`);

    for (const provider of providers) {
        const errors = validateProvider(provider);
        if (errors.length > 0) problems.push(`"${provider.urn}" : ${errors.join(" ; ")}`);
    }

    if (problems.length > 0) {
        throw new Error(`Manifeste de providers invalide :\n  - ${problems.join("\n  - ")}`);
    }

    // 2) Idempotent creation (skip-if-exists).
    const created: string[] = [];
    const skipped: string[] = [];
    for (const provider of providers) {
        if (await repo.getProvider(provider.urn)) {
            skipped.push(provider.urn);
            continue;
        }
        await repo.createProvider(provider);
        created.push(provider.urn);
    }

    return { created, skipped };
}
