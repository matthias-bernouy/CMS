import { expect, test } from "bun:test";
import { InMemoryLocalCredentialStore, LocalAuthentication, SubjectResolver } from "@bernouy/cms-auth";
import { readCookie } from "cms-auth/sessions/core/cookies";
import {
    ISSUER,
    ISSUER_PATH,
    discovery,
    flightCookie,
    idToken,
    installOidcTestHooks,
    json,
    jwks,
    mockFetch,
    oidcRequest,
    setupOidc,
} from "./oidcFixtures";

installOidcTestHooks();

test("local and OIDC use the same session format and retain their configured lifetimes", async () => {
    const { auth: oidc, codec, users } = await setupOidc(180);
    const credentials = new InMemoryLocalCredentialStore();
    await credentials.create({ email: "member@example.test", password: "password-1" });
    const local = new LocalAuthentication({
        providerId: "local",
        loginPagePath: "/login",
        logoutPath: "/auth/logout",
        credentials,
        resolver: new SubjectResolver(users),
        codec,
        cookieName: "cms-session",
        cookieSecure: true,
        sessionTtlSeconds: 90,
    });

    const localResult = await local.authenticate("member@example.test", "password-1");
    expect(localResult.ok).toBe(true);
    if (!localResult.ok) {
        throw new Error("Expected local login to succeed");
    }
    expect(localResult.cookie).toContain("Max-Age=90");
    expect(localResult.cookie).toContain("; Secure");
    const localRequest = oidcRequest("https://cms.example/account", localResult.cookie.split(";")[0]);
    expect(await local.getSubject(localRequest)).toEqual(localResult.subject);
    const localPayload = await codec.verify<{ kind: string; sub: string; exp: number }>(
        readCookie(localRequest, "cms-session")!,
    );
    expect(localPayload?.kind).toBe("session");
    expect(localPayload?.sub).toBe(localResult.subject.identifier);
    expect(localPayload!.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(85);
    expect(localPayload!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(90);

    mockFetch(async (url) => {
        if (url === ISSUER + "/.well-known/openid-configuration") {
            return discovery();
        }
        if (url === ISSUER + "/token") {
            return json({ id_token: await idToken({ nonce: "nonce", email_verified: true }) });
        }
        if (url === ISSUER + "/jwks") {
            return jwks();
        }
        return new Response("unexpected", { status: 500 });
    });
    const flight = await flightCookie(codec, { state: "state", nonce: "nonce" });
    const callback = await oidc.callback(oidcRequest(ISSUER_PATH + "/callback?state=state&code=code", flight));
    expect(callback.status).toBe(302);
    const oidcCookie = callback.headers.getSetCookie()[0]!;
    expect(oidcCookie).toContain("Max-Age=180");
    const oidcSessionRequest = oidcRequest("https://cms.example/account", oidcCookie.split(";")[0]);
    expect(await local.getSubject(oidcSessionRequest)).toEqual({ identifier: "sso:sub-1" });
    const oidcPayload = await codec.verify<{ kind: string; exp: number }>(
        readCookie(oidcSessionRequest, "cms-session")!,
    );
    expect(oidcPayload?.kind).toBe("session");
    expect(oidcPayload!.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(175);
    expect(oidcPayload!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(180);
    expect(local.clearSession()).toContain("Max-Age=0; Secure");
});
