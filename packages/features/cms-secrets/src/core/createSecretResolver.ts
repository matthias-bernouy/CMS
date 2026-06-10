import type { SecretStore } from "cms-secrets/interfaces/SecretStore";

/**
 * Builds the `(ref) => value` resolver consumers hand to callback seams
 * like the gateway's `ExecutorDeps.resolveSecret`. NEVER throws and maps
 * a missing key (`null`) to `undefined`, so the caller surfaces its own
 * clean failure (e.g. the gateway's 500 "secret introuvable") rather
 * than an unhandled throw.
 */
export function createSecretResolver(secrets: SecretStore): (ref: string) => Promise<string | undefined> {
    return async (ref: string) => {
        try {
            return (await secrets.get(ref)) ?? undefined;
        } catch {
            return undefined;
        }
    };
}
