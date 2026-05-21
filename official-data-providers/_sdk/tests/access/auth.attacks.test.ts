import { test, expect } from "bun:test";
import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { makeClock } from "tests/helpers/clock";
import { createVerifier } from "src/core/auth/verifyToken";
import { AuthError } from "src/core/errors";
import { deps, aligned } from "tests/helpers/authDeps";

const now = () => Math.floor(Date.now() / 1000);

test("alg confusion: none and HS256 rejected before key work", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    try {
        const v = createVerifier(deps(fi, clock));
        await expect(v(`Bearer ${await aligned(fi, clock, { alg: "none" })}`)).rejects.toBeInstanceOf(AuthError);
        await expect(v(`Bearer ${await aligned(fi, clock, { alg: "HS256" })}`)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});

test("signature from another issuer's key → AuthError", async () => {
    const fi = await FakeIssuer.start(); const evil = await FakeIssuer.start();
    const clock = makeClock(now());
    try {
        const v = createVerifier(deps(fi, clock));
        // claims say iss = fi, but signed by `evil`'s key
        const tok = await evil.mint({ aud: "prov-1", iss: fi.iss, iat: clock.nowSec(), exp: clock.nowSec() + 120 });
        await expect(v(`Bearer ${tok}`)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); evil.stop(); }
});

test("SSRF: cross-origin jwks_uri → AuthError + security log", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    const events: string[] = [];
    try {
        fi.setJwksUri("http://169.254.169.254/jwks.json");
        const d = deps(fi, clock); d.onSecurity = (r) => events.push(r);
        const v = createVerifier(d);
        await expect(v(`Bearer ${await aligned(fi, clock)}`)).rejects.toBeInstanceOf(AuthError);
        expect(events).toContain("ssrf_or_issuer_mismatch");
    } finally { fi.stop(); }
});

test("malformed jwks_uri (not a URL) → AuthError + log", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    const events: string[] = [];
    try {
        fi.setJwksUri("not-a-valid-url");
        const d = deps(fi, clock); d.onSecurity = (r) => events.push(r);
        const v = createVerifier(d);
        await expect(v(`Bearer ${await aligned(fi, clock)}`)).rejects.toBeInstanceOf(AuthError);
        expect(events).toContain("ssrf_or_issuer_mismatch");
    } finally { fi.stop(); }
});

test("incompatible data_provider_contract_version → AuthError", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    const events: string[] = [];
    try {
        fi.setContractVersion("2.0"); // supported major is 1
        const d = deps(fi, clock); d.onSecurity = (r) => events.push(r);
        const v = createVerifier(d);
        await expect(v(`Bearer ${await aligned(fi, clock)}`)).rejects.toBeInstanceOf(AuthError);
        expect(events).toContain("contract_version_incompatible");
    } finally { fi.stop(); }
});

test("rotation race: token signed by freshly published key → accepted (no false 401)", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    try {
        const kid2 = await fi.rotateKey();          // k2 active, JWKS has k1+k2
        const v = createVerifier(deps(fi, clock));
        const r = await v(`Bearer ${await aligned(fi, clock, { kid: kid2 })}`);
        expect(r.claims.aud).toBe("prov-1");
    } finally { fi.stop(); }
});

test("orphan key (kid absent from JWKS) → AuthError", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    try {
        const tok = await aligned(fi, clock, { kid: "k1" });
        fi.dropKey("k1");                            // JWKS now empty, before first fetch
        const v = createVerifier(deps(fi, clock));
        await expect(v(`Bearer ${tok}`)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});

test("negative cache: 2nd unknown-kid failure within window → reject WITHOUT re-hammering", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    try {
        const t1 = await aligned(fi, clock, { kid: "k1" });
        const t2 = await aligned(fi, clock, { kid: "k1" });
        fi.dropKey("k1");
        const v = createVerifier(deps(fi, clock));     // same verifier instance
        await expect(v(`Bearer ${t1}`)).rejects.toBeInstanceOf(AuthError); // forced refresh + retry-fail
        await expect(v(`Bearer ${t2}`)).rejects.toBeInstanceOf(AuthError); // refresh refused (neg-cache)
    } finally { fi.stop(); }
});

test("discovery metadoc returns non-2xx → AuthError + log", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    const events: string[] = [];
    try {
        fi.failMetadoc(503);
        const d = deps(fi, clock); d.onSecurity = (r) => events.push(r);
        const v = createVerifier(d);
        await expect(v(`Bearer ${await aligned(fi, clock)}`)).rejects.toBeInstanceOf(AuthError);
        expect(events).toContain("discovery_unreachable");
    } finally { fi.stop(); }
});

test("discovery endpoint unreachable → AuthError", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(now());
    const v = createVerifier(deps(fi, clock));
    const tok = await aligned(fi, clock);
    fi.stop();                                       // issuer down before verify
    await expect(v(`Bearer ${tok}`)).rejects.toBeInstanceOf(AuthError);
});
