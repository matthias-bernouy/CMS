import { test, expect } from "bun:test";
import { jwtVerify, createLocalJWKSet, decodeJwt, type JSONWebKeySet } from "jose";
import { metadocPath, DATA_PROVIDER_CONTRACT_VERSION } from "@bernouy/data-provider-contract";
import { BunRunner } from "@bernouy/runner-bun";
import { serveForTest } from "@bernouy/runner-bun/testing";
import { MemoryKeyStore } from "src/default-implementation/MemoryKeyStore";
import { parseIssuerConfig } from "src/core/schemas/issuerConfig";
import { mountIssuer } from "src/exports/mountIssuer";
import { createTenantIssuer, createControlPlaneIssuer } from "src/exports/issuers";

const ISS = "https://h/i1";
const T = 1_700_000_000;
const ks = () => new MemoryKeyStore({ now: () => T, keyOverlapSeconds: 100 });

test("mountIssuer serves metadoc + JWKS at the SHARED metadocPath/jwksUri (public)", async () => {
    const config = parseIssuerConfig({ issuer: ISS });
    const r = new BunRunner();
    mountIssuer(r, { config, keyStore: ks() });
    const srv = serveForTest(r);
    try {
        const metaPath = new URL(metadocPath(ISS)).pathname;          // /i1/.well-known/oauth-authorization-server
        expect(metaPath).toBe("/i1/.well-known/oauth-authorization-server");
        const meta = await (await srv.request("GET", metaPath)).json();
        expect(meta.issuer).toBe(ISS);
        expect(meta.data_provider_contract_version).toBe(DATA_PROVIDER_CONTRACT_VERSION);

        const jwks = await (await srv.request("GET", new URL(config.jwksUri).pathname)).json();
        expect(Array.isArray(jwks.keys)).toBe(true);
        expect(jwks.keys.length).toBe(1);
    } finally { srv.stop(); }
});

test("tenant profile: mint with sub, served, verifies via the kit's own JWKS", async () => {
    const ti = createTenantIssuer({ issuer: ISS, keyStore: ks(), now: () => T });
    const r = new BunRunner();
    ti.mount(r);
    const srv = serveForTest(r);
    try {
        const tok = await ti.mint({ aud: "prov-1", sub: "opaque-9" });

        const jwks = (await (await srv.request("GET", new URL(ti.config.jwksUri).pathname)).json()) as JSONWebKeySet;
        const { payload } = await jwtVerify(tok, createLocalJWKSet(jwks), {
            issuer: ISS, audience: "prov-1", currentDate: new Date(T * 1000),
        });
        expect(payload.sub).toBe("opaque-9");

        // rotation works on the tenant profile too (served JWKS grows)
        const n0 = (await (await srv.request("GET", new URL(ti.config.jwksUri).pathname)).json()).keys.length;
        await ti.rotate();
        const n1 = (await (await srv.request("GET", new URL(ti.config.jwksUri).pathname)).json()).keys.length;
        expect(n1).toBe(n0 + 1);
    } finally { srv.stop(); }
});

test("default clock path: issuer without injected `now` still mints", async () => {
    const ti = createTenantIssuer({ issuer: ISS, keyStore: ks() }); // no `now`
    const c = decodeJwt(await ti.mint({ aud: "p" }));
    expect(c.iss).toBe(ISS);
    expect(c.iat).toBeGreaterThan(1_700_000_000);                // real clock used
});

test("control-plane profile: never a sub; rotation reflected in served JWKS", async () => {
    const cp = createControlPlaneIssuer({ issuer: ISS, keyStore: ks(), now: () => T });
    const r = new BunRunner();
    cp.mount(r);
    const srv = serveForTest(r);
    try {
        const tok = await cp.mint({ aud: "prov-1" });
        expect("sub" in decodeJwt(tok)).toBe(false);

        const before = (await (await srv.request("GET", new URL(cp.config.jwksUri).pathname)).json()).keys.length;
        await cp.rotate();
        const after = (await (await srv.request("GET", new URL(cp.config.jwksUri).pathname)).json()).keys.length;
        expect(after).toBe(before + 1);                               // old (overlap) + new
    } finally { srv.stop(); }
});
