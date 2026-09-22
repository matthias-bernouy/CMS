import { describe, expect, test } from "bun:test";
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

describe("OidcAuthentication", () => {
    test("rejects discovery metadata with non-https endpoints", async () => {
        const { auth } = await setupOidc();
        mockFetch(async (url) => {
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return json({
                    authorization_endpoint: `${ISSUER}/authorize`,
                    token_endpoint: "http://issuer.example/token",
                    jwks_uri: `${ISSUER}/jwks`,
                });
            }
            return new Response("unexpected", { status: 500 });
        });

        await expect(auth.login(oidcRequest(`${ISSUER_PATH}/login`))).rejects.toThrow(/non-https endpoint/);
    });

    test("callback with a bad state redirects to the login error", async () => {
        const { auth, codec } = await setupOidc();
        let tokenCalls = 0;
        mockFetch(async (url) => {
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return discovery();
            }
            if (url === `${ISSUER}/token`) {
                tokenCalls++;
            }
            return new Response("unexpected", { status: 500 });
        });
        const cookie = await flightCookie(codec, { state: "expected", nonce: "nonce" });

        const response = await auth.callback(oidcRequest(`${ISSUER_PATH}/callback?state=wrong&code=code`, cookie));

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?error=oidc");
        expect(tokenCalls).toBe(0);
    });

    test("callback rejects a nonce mismatch after id_token verification", async () => {
        const { auth, codec } = await setupOidc();
        mockFetch(async (url) => {
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return discovery();
            }
            if (url === `${ISSUER}/token`) {
                return json({ id_token: await idToken({ nonce: "other", email_verified: true }) });
            }
            if (url === `${ISSUER}/jwks`) {
                return jwks();
            }
            return new Response("unexpected", { status: 500 });
        });
        const cookie = await flightCookie(codec, { state: "state", nonce: "expected" });

        const response = await auth.callback(oidcRequest(`${ISSUER_PATH}/callback?state=state&code=code`, cookie));

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?error=oidc");
    });

    test("does not trust an unverified email claim", async () => {
        const { auth, codec, users } = await setupOidc();
        mockFetch(async (url) => {
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return discovery();
            }
            if (url === `${ISSUER}/token`) {
                return json({
                    id_token: await idToken({ nonce: "nonce", email: "claimed@example.test", email_verified: false }),
                });
            }
            if (url === `${ISSUER}/jwks`) {
                return jwks();
            }
            return new Response("unexpected", { status: 500 });
        });
        const cookie = await flightCookie(codec, { state: "state", nonce: "nonce", returnTo: "/admin" });

        const response = await auth.callback(oidcRequest(`${ISSUER_PATH}/callback?state=state&code=code`, cookie));

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/admin");
        const responseCookies = response.headers.getSetCookie();
        expect(responseCookies).toHaveLength(2);
        expect(responseCookies[0]).toContain("cms-session=");
        expect(responseCookies[1]).toContain("cms-session-oidc-sso=");
        expect(responseCookies[1]).toContain("Max-Age=0");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("vary")).toBe("Cookie, Authorization");
        const user = await users.getBySub("sso:sub-1");
        expect(user?.email).toBeUndefined();
        expect(user).not.toHaveProperty("displayName");
    });

    test("token exchange failure redirects without logging the provider body", async () => {
        const { auth, codec } = await setupOidc();
        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => {
            const message = args.join(" ");
            if (message.startsWith("[oidc:sso]")) {
                warnings.push(message);
            } else {
                originalWarn(...args);
            }
        };
        mockFetch(async (url) => {
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return discovery();
            }
            if (url === `${ISSUER}/token`) {
                return new Response("provider-secret-detail", { status: 400 });
            }
            return new Response("unexpected", { status: 500 });
        });
        const cookie = await flightCookie(codec, { state: "state", nonce: "nonce" });

        let response: Response;
        try {
            response = await auth.callback(oidcRequest(`${ISSUER_PATH}/callback?state=state&code=code`, cookie));
        } finally {
            console.warn = originalWarn;
        }

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/login?error=oidc");
        expect(warnings).toEqual(["[oidc:sso] login failed: token_exchange_400"]);
        expect(warnings.join(" ")).not.toContain("provider-secret-detail");
    });
});
