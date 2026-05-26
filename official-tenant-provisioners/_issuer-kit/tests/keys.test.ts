import { test, expect } from "bun:test";
import { SignJWT, jwtVerify, createLocalJWKSet, type JWK } from "jose";
import { generateSigningKey } from "src/core/keys/generate";
import { isPrunable } from "src/core/keys/rotation";
import { MemoryKeyStore } from "src/default-implementation/MemoryKeyStore";
import type { SigningKey } from "src/types/SigningKey";

const jwks = (keys: { publicJwk: JWK }[]) =>
    createLocalJWKSet({ keys: keys.map((k) => k.publicJwk) });

async function sign(k: SigningKey): Promise<string> {
    return new SignJWT({ t: 1 })
        .setProtectedHeader({ alg: "ES256", kid: k.kid })
        .setExpirationTime("5m").sign(k.privateKey);
}

test("generateSigningKey: ES256, kid = JWK thumbprint, use/alg set", async () => {
    const k = await generateSigningKey(1000);
    expect(k.publicJwk.kid).toBe(k.kid);
    expect(k.publicJwk.alg).toBe("ES256");
    expect(k.publicJwk.use).toBe("sig");
    expect(k.kid.length).toBeGreaterThan(20); // base64url sha-256 thumbprint
});

test("MemoryKeyStore: stable kid without rotation; token verifies via JWKS", async () => {
    let t = 1000;
    const ks = new MemoryKeyStore({ now: () => t, keyOverlapSeconds: 100 });
    const a1 = await ks.loadActive();
    const a2 = await ks.loadActive();
    expect(a1.kid).toBe(a2.kid);                               // stable, no rotation
    const tok = await sign(a1);
    const { payload } = await jwtVerify(tok, jwks(await ks.loadAll()));
    expect(payload.t).toBe(1);
});

test("rotation publish-before-sign: old token still verifies during overlap, gone after", async () => {
    let t = 1000;
    const ks = new MemoryKeyStore({ now: () => t, keyOverlapSeconds: 100 });
    const oldKey = await ks.loadActive();
    const oldTok = await sign(oldKey);

    await ks.rotate();
    const newKey = await ks.loadActive();
    expect(newKey.kid).not.toBe(oldKey.kid);

    // JWKS still publishes the retired key → old token valid (overlap)
    await expect(jwtVerify(oldTok, jwks(await ks.loadAll()))).resolves.toBeDefined();
    const all = await ks.loadAll();
    expect(all.map((k) => k.kid).sort()).toEqual([oldKey.kid, newKey.kid].sort());

    // past retiredAt + overlap → pruned, old token no longer verifies
    t = 1000 + 100 + 1;
    const pruned = await ks.loadAll();
    expect(pruned.map((k) => k.kid)).toEqual([newKey.kid]);
    await expect(jwtVerify(oldTok, jwks(pruned))).rejects.toBeDefined();
    // the new key still signs+verifies
    await expect(jwtVerify(await sign(newKey), jwks(pruned))).resolves.toBeDefined();
});

test("isPrunable: active never prunable; retired only past overlap", () => {
    expect(isPrunable({ retiredAt: undefined }, 9_999, 100)).toBe(false);
    expect(isPrunable({ retiredAt: 1000 }, 1050, 100)).toBe(false); // within overlap
    expect(isPrunable({ retiredAt: 1000 }, 1101, 100)).toBe(true);  // past overlap
});
