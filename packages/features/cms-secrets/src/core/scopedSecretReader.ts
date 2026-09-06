import type { SecretReader } from "../interfaces/SecretReader";
import { secretRefToKey } from "./secretRef";

/** An immutable read grant; it cannot enumerate, mutate, or read other vault keys. */
export function scopedSecretReader(reader: SecretReader, refs: readonly string[]): SecretReader {
    const keys = new Set(
        refs.map((ref) => {
            const key = secretRefToKey(ref);
            if (!key) {
                throw new Error("Secret grant must be an exact secret reference");
            }
            return key;
        }),
    );
    return {
        async get(key) {
            if (!keys.has(key)) {
                throw new Error("Secret access was not granted");
            }
            return reader.get(key);
        },
    };
}
