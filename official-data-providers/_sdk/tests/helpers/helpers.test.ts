import { test, expect } from "bun:test";
import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader } from "jose";
import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { makeClock } from "tests/helpers/clock";

test("clock: deterministic advance/set", () => {
    const c = makeClock(1000);
    expect(c.nowSec()).toBe(1000);
    c.advance(50); expect(c.nowSec()).toBe(1050);
    c.set(0);      expect(c.nowSec()).toBe(0);
});

test("fakeIssuer: metadoc + JWKS reachable, defaults same-origin", async () => {
    const fi = await FakeIssuer.start();
    try {
        const meta = await (await fetch(`${fi.iss}/.well-known/oauth-authorization-server`)).json();
        expect(meta.issuer).toBe(fi.iss);
        expect(meta.jwks_uri).toBe(`${fi.iss}/jwks.json`);
        expect(meta.data_provider_contract_version).toBe("1.0");
        const jwks = await (await fetch(meta.jwks_uri)).json();
        expect(jwks.keys.length).toBe(1);
    } finally { fi.stop(); }
});

test("fakeIssuer: a minted ES256 token verifies against the JWKS", async () => {
    const fi = await FakeIssuer.start();
    try {
        const token = await fi.mint({ aud: "prov-1", sub: "opaque-1" });
        const jwks = createRemoteJWKSet(new URL(fi.jwksUri));
        const { payload } = await jwtVerify(token, jwks, { issuer: fi.iss, audience: "prov-1" });
        expect(payload.sub).toBe("opaque-1");
        expect(typeof payload.jti).toBe("string");
    } finally { fi.stop(); }
});

test("fakeIssuer: malicious alg shapes (none / HS256)", async () => {
    const fi = await FakeIssuer.start();
    try {
        const none = await fi.mint({ aud: "p", alg: "none" });
        expect(decodeProtectedHeader(none).alg).toBe("none");
        expect(none.endsWith(".")).toBe(true);
        const hs = await fi.mint({ aud: "p", alg: "HS256" });
        expect(decodeProtectedHeader(hs).alg).toBe("HS256");
    } finally { fi.stop(); }
});

test("fakeIssuer: rotation keeps old key, dropKey orphans it", async () => {
    const fi = await FakeIssuer.start();
    try {
        const tokOld = await fi.mint({ aud: "p", kid: "k1" });
        const newKid = await fi.rotateKey();
        expect(newKid).toBe("k2");
        let jwks = await (await fetch(fi.jwksUri)).json();
        expect(jwks.keys.map((k: { kid: string }) => k.kid).sort()).toEqual(["k1", "k2"]);

        fi.dropKey("k1");
        jwks = await (await fetch(fi.jwksUri)).json();
        expect(jwks.keys.map((k: { kid: string }) => k.kid)).toEqual(["k2"]);
        const set = createRemoteJWKSet(new URL(fi.jwksUri));
        await expect(jwtVerify(tokOld, set, { issuer: fi.iss, audience: "p" })).rejects.toThrow();
    } finally { fi.stop(); }
});

test("fakeIssuer: cross-origin jwks_uri (SSRF) + bad contract version knobs", async () => {
    const fi = await FakeIssuer.start();
    try {
        fi.setJwksUri("http://169.254.169.254/jwks.json");
        fi.setContractVersion("9.9");
        const meta = await (await fetch(`${fi.iss}/.well-known/oauth-authorization-server`)).json();
        expect(meta.jwks_uri).toBe("http://169.254.169.254/jwks.json");
        expect(new URL(meta.jwks_uri).origin).not.toBe(fi.iss);
        expect(meta.data_provider_contract_version).toBe("9.9");
    } finally { fi.stop(); }
});
