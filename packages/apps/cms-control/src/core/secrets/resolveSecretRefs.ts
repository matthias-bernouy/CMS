import type { SecretStore } from "@bernouy/cms-shared";
import { SecretNotFound } from "cms-control/errors/SecretNotFound";

/**
 * Pattern matching an env-var-style secret reference. Mirrors the picker's
 * emit format and the validation regex (`^[A-Z][A-Z0-9_]*$`).
 *
 * The `\$\{…\}` wrapper makes refs unambiguous next to the templating
 * `{{ … }}` used elsewhere — the two channels never collide.
 */
const PATTERN = /\$\{([A-Z][A-Z0-9_]*)\}/g;

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
    if (!input.includes("${")) return input;

    const refs = [...input.matchAll(PATTERN)];
    if (refs.length === 0) return input;

    const cache = new Map<string, string>();
    for (const m of refs) {
        const key = m[1] as string;
        if (cache.has(key)) continue;
        const value = await secrets.get(key);
        if (value === null) throw new SecretNotFound(key);
        cache.set(key, value);
    }

    return input.replace(PATTERN, (_, key: string) => cache.get(key) as string);
}
