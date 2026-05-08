import type { SecretStore } from "src/socle/interfaces/SecretStore";
import type { TDataAuth } from "src/socle/interfaces/Data/data";
import { resolveSecretRefs } from "src/control/core/secrets/resolveSecretRefs";

/**
 * Walk a `TDataAuth` and replace every `${KEY}` reference with the value
 * stored in `secrets`. Returns a fresh auth object — caller-supplied
 * arrays/strings are not mutated.
 *
 * Throws `SecretNotFound` (from `resolveSecretRefs`) if any key is
 * missing from the store. The sync/test endpoints catch and surface
 * that as a structured error.
 */
export async function resolveAuth(auth: TDataAuth, secrets: SecretStore): Promise<TDataAuth> {
    if (auth.type === "bearer") {
        return { type: "bearer", token: await resolveSecretRefs(auth.token, secrets) };
    }
    if (auth.type === "headers") {
        const headers = [];
        for (const h of auth.headers) {
            headers.push({
                name:  h.name,
                value: await resolveSecretRefs(h.value, secrets),
            });
        }
        return { type: "headers", headers };
    }
    return auth;
}
