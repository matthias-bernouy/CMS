import { test, expect } from "bun:test";
import { FakeIssuer } from "tests/helpers/fakeIssuer";
import { makeClock } from "tests/helpers/clock";
import { createVerifier } from "src/core/auth/verifyToken";
import { AuthError } from "src/core/errors";
import { deps, aligned } from "tests/helpers/authDeps";

test("nominal: tenant scope (no sub) — role + scope correct", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock, "tenant"));
        const r = await v(`Bearer ${await aligned(fi, clock)}`);
        expect(r.scope).toBe("tenant"); expect(r.role).toBe("tenant");
        expect(r.claims.aud).toBe("prov-1");
    } finally { fi.stop(); }
});

test("nominal: user scope when sub present; control-plane role propagated", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock, "control-plane"));
        const r = await v(`Bearer ${await aligned(fi, clock, { sub: "opaque-9" })}`);
        expect(r.scope).toBe("user"); expect(r.claims.sub).toBe("opaque-9");
        expect(r.role).toBe("control-plane");
    } finally { fi.stop(); }
});

test("missing / malformed Bearer → AuthError", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock));
        await expect(v(null)).rejects.toBeInstanceOf(AuthError);
        await expect(v("Token abc")).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});

test("iss not in allowlist → AuthError", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock, "tenant", "https://not-trusted.example"));
        await expect(v(`Bearer ${await aligned(fi, clock)}`)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});

test("aud ≠ provider → AuthError (anti cross-provider replay)", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock));
        const tok = await fi.mint({ aud: "another-provider", iat: clock.nowSec(), exp: clock.nowSec() + 120 });
        await expect(v(`Bearer ${tok}`)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});

test("expired exp and future iat (beyond skew) → AuthError", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock));
        const expired = await fi.mint({ aud: "prov-1", iat: clock.nowSec() - 300, exp: clock.nowSec() - 100 });
        await expect(v(`Bearer ${expired}`)).rejects.toBeInstanceOf(AuthError);
        const future = await fi.mint({ aud: "prov-1", iat: clock.nowSec() + 1000, exp: clock.nowSec() + 1120 });
        await expect(v(`Bearer ${future}`)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});

test("replay: same jti twice → 2nd rejected", async () => {
    const fi = await FakeIssuer.start(); const clock = makeClock(Math.floor(Date.now() / 1000));
    try {
        const v = createVerifier(deps(fi, clock));
        const tok = `Bearer ${await aligned(fi, clock, { jti: "fixed-jti" })}`;
        expect((await v(tok)).claims.jti).toBe("fixed-jti");
        await expect(v(tok)).rejects.toBeInstanceOf(AuthError);
    } finally { fi.stop(); }
});
