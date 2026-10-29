import { expect, test } from "bun:test";
import { DecryptedAuthenticationCache } from "../../../src/runtime/authentication/material/DecryptedAuthenticationCache";

const blob = () => ({ ciphertext: Buffer.from("ciphertext"), iv: Buffer.alloc(12) });
const secrets = { instanceAccessToken: "token", invocationSecret: "signing" };

test("decrypted authentication cache bounds entries, bytes and copies mutable inputs", () => {
    const cache = new DecryptedAuthenticationCache(2, 256);
    const input = blob();
    const mutableSecrets = { ...secrets };
    cache.remember("a", input, mutableSecrets);
    input.ciphertext.fill(0);
    mutableSecrets.invocationSecret = "mutated";
    expect(cache.get("a", blob())).toEqual(secrets);
    cache.remember("b", blob(), secrets);
    expect(cache.get("a", blob())).toEqual(secrets);
    cache.remember("c", blob(), secrets);
    expect(cache.get("b", blob())).toBeUndefined();
    cache.remember("oversized", blob(), { ...secrets, invocationSecret: "x".repeat(257) });
    expect(cache.get("oversized", blob())).toBeUndefined();
    const byteBound = new DecryptedAuthenticationCache(10, 40);
    byteBound.remember("a", blob(), secrets);
    byteBound.remember("b", blob(), secrets);
    expect(byteBound.get("a", blob())).toBeUndefined();
    expect(byteBound.get("b", blob())).toEqual(secrets);
});

test("a ciphertext or IV change evicts decoded material before any reuse", () => {
    const cache = new DecryptedAuthenticationCache();
    cache.remember("a", blob(), secrets);
    const changed = blob();
    changed.iv[0] = 1;
    expect(cache.get("a", changed)).toBeUndefined();
    expect(cache.get("a", blob())).toBeUndefined();
    cache.remember("a", blob(), secrets);
    changed.iv[0] = 0;
    changed.ciphertext[0] = 1;
    expect(cache.get("a", changed)).toBeUndefined();
    cache.remember("a", blob(), secrets);
    cache.delete("a");
    expect(cache.get("a", blob())).toBeUndefined();
});
