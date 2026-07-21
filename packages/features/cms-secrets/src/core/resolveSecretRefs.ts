import type { SecretStore } from "cms-secrets/interfaces/SecretStore";
import { SecretNotFound } from "cms-secrets/core/SecretNotFound";
import { secretRefGlobalPattern } from "cms-secrets/core/secretRef";
/**
 * Replaces every `${KEY}` in `input` with the value stored under `KEY`.
 * Multi-occurrences supported (`https://${USER}:${PASS}@host`). Returns
 * the input unchanged when there is no reference at all (cheap fast-path
 * for fields without secrets).
 *
 * Throws `SecretNotFound(key)` on the FIRST missing key — the caller
 * decides how to surface it (HTTP 502, log + skip, …). We never leak
 * a literal `${KEY}` on the wire by silently passing it through.
 */
export async function resolveSecretRefs(input: string, secrets: SecretStore): Promise<string> {
    if (!input.includes("${")) {
        return input;
    }

    const pattern = secretRefGlobalPattern();
    const refs = [...input.matchAll(pattern)];
    if (refs.length === 0) {
        return input;
    }

    const cache = new Map<string, string>();
    for (const m of refs) {
        const key = m[1] as string;
        if (cache.has(key)) {
            continue;
        }
        const value = await secrets.get(key);
        if (value === null) {
            throw new SecretNotFound(key);
        }
        cache.set(key, value);
    }

    return input.replace(secretRefGlobalPattern(), (_, key: string) => cache.get(key) as string);
}
