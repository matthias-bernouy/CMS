import { test, expect } from "bun:test";
import { decodeJwt, decodeProtectedHeader, jwtVerify, createLocalJWKSet } from "jose";
import { CRYPTO_DEFAULTS } from "@bernouy/data-provider-contract";
import { parseIssuerConfig } from "src/core/schemas/issuerConfig";
import { MemoryKeyStore } from "src/default-implementation/MemoryKeyStore";
import { buildJwks } from "src/core/publish/jwks";
import { createMinter } from "src/core/mint";
import { IssuerError } from "src/core/errors";

const ISS = "https://cdn.example/i1";
const setup = () => {
    let t = 1_700_000_000;
    const ks = new MemoryKeyStore({ now: () => t, keyOverlapSeconds: 100 });
    const config = parseIssuerConfig({ issuer: ISS });
    const minter = createMinter({ keyStore: ks, config, now: () => t });
    return { ks, config, minter, clock: { set: (v: number) => { t = v; }, get: () => t } };
};

test("mint: ES256 + active kid, contract claims, no role, ttl=default", async () => {
    const { ks, minter, config } = setup();
    const tok = await minter.mint({ iss: ISS, aud: "prov-1" });
    const h = decodeProtectedHeader(tok);
    const c = decodeJwt(tok);
    expect(h.alg).toBe("ES256");
    expect(h.kid).toBe((await ks.loadActive()).kid);
    expect(c.iss).toBe(ISS);
    expect(c.aud).toBe("prov-1");
    expect(typeof c.jti).toBe("string");
    expect(c.exp! - c.iat!).toBe(config.tokenTtlSeconds);
    expect("sub" in c).toBe(false);
    expect("role" in c).toBe(false);                       // role is provider-side (§4.7)
});

test("mint: sub only when provided; verifies via the kit's own JWKS", async () => {
    const { ks, minter } = setup();
    const tok = await minter.mint({ iss: ISS, aud: "prov-1", sub: "opaque-9" });
    const { payload } = await jwtVerify(
        tok, createLocalJWKSet(await buildJwks(ks)),
        { issuer: ISS, audience: "prov-1", currentDate: new Date(1_700_000_000 * 1000) },
    );
    expect(payload.sub).toBe("opaque-9");
});

test("mint: ttl clamped to the SHARED contract max", async () => {
    const { minter } = setup();
    await expect(minter.mint({ iss: ISS, aud: "p", ttlSeconds: CRYPTO_DEFAULTS.tokenTtlMax + 1 }))
        .rejects.toBeInstanceOf(IssuerError);
    await expect(minter.mint({ iss: ISS, aud: "p", ttlSeconds: 0 }))
        .rejects.toBeInstanceOf(IssuerError);
    const ok = await minter.mint({ iss: ISS, aud: "p", ttlSeconds: 60 });
    const c = decodeJwt(ok);
    expect(c.exp! - c.iat!).toBe(60);
});

test("mint: follows key rotation (uses the new active kid)", async () => {
    const { ks, minter } = setup();
    const before = decodeProtectedHeader(await minter.mint({ iss: ISS, aud: "p" })).kid;
    await ks.rotate();
    const after = decodeProtectedHeader(await minter.mint({ iss: ISS, aud: "p" })).kid;
    expect(after).not.toBe(before);
    expect(after).toBe((await ks.loadActive()).kid);
});
