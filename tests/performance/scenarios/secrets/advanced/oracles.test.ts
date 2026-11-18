import { expect, test } from "bun:test";
import { assertSecretMetadataList } from "./oracles";

const record = (name: string, version = 1) => ({
    namespaceId: "namespace-a",
    secretId: `secret-${name}`,
    name,
    version,
    createdAt: "2026-11-18T00:00:00.000Z",
    rotatedAt: version === 1 ? null : "2026-11-18T00:00:01.000Z",
});

test("secret list evidence requires exact bounded order, current versions and namespace identities without private fields", () => {
    const a = record("a", 9);
    const b = record("b");
    expect(() => assertSecretMetadataList({ items: [a] }, [b, a], 1)).not.toThrow();
    expect(() => assertSecretMetadataList({ items: [a, b] }, [b, a], 100)).not.toThrow();
    for (const items of [
        [b, a],
        [a, a],
        [record("a"), b],
        [{ ...a, namespaceId: "foreign" }, b],
        [{ ...a, value: "private" }, b],
        [a],
        [a, b, record("c")],
    ]) {
        expect(() => assertSecretMetadataList({ items }, [a, b], 100)).toThrow();
    }
    expect(() => assertSecretMetadataList({ items: [a, b] }, [a, b], 1)).toThrow();
});
