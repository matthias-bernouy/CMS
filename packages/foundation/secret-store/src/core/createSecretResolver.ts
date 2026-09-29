import type { SecretReader } from "secret-store/interfaces/SecretReader";
import { secretRefToKey } from "./secretRef";

/**
 * Builds a `(ref) => value` resolver for consumers that accept exact
 * `${KEY}` references or plain keys. A missing key maps to `undefined`;
 * callers decide how to report unavailable secrets.
 */
export function createSecretResolver(secrets: SecretReader): (ref: string) => Promise<string | undefined> {
    return async (ref: string) => {
        try {
            return (await secrets.get(secretRefToKey(ref) ?? ref)) ?? undefined;
        } catch {
            return undefined;
        }
    };
}
