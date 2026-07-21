import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { OidcAuthentication } from "cms-auth/default-implementation/OidcAuthentication";
import { SignedCookieCodec } from "@bernouy/cms-auth";
import { SubjectResolver } from "cms-auth/core/SubjectResolver";
import { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";
import { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";
import { InMemorySecretStore } from "@bernouy/cms-secrets";

type Role = "admin" | "user";

const ISSUER = "https://issuer.example";
const CLIENT_ID = "cms-client";
const COOKIE = "cms-session";
const KEY_ID = "test-key";
const codec = () => new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes"));

let privateKey: CryptoKey;
let publicJwk: JWK;
let originalFetch: typeof fetch;

beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = await exportJWK(pair.publicKey);
    publicJwk.kid = KEY_ID;
    publicJwk.alg = "RS256";
    publicJwk.use = "sig";
});

beforeEach(() => {
    originalFetch = globalThis.fetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("OidcAuthentication", () => {
    test("rejects discovery metadata with non-https endpoints", async () => {
        const { auth } = await setup();
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

        await expect(auth.login(req(`${ISSUER_PATH}/login`))).rejects.toThrow(/non-https endpoint/);
    });

    test("callback with a bad state redirects to the login error", async () => {
        const { auth, codec } = await setup();
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

        const res = await auth.callback(req(`${ISSUER_PATH}/callback?state=wrong&code=code`, cookie));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=oidc");
        expect(tokenCalls).toBe(0);
    });

    test("callback rejects a nonce mismatch after id_token verification", async () => {
        const { auth, codec } = await setup();
        mockFetch(async (url) => {
            if (url === `${ISSUER}/.well-known/openid-configuration`) {
                return discovery();
            }
            if (url === `${ISSUER}/token`) {
                return json({ id_token: await idToken({ nonce: "other", email_verified: true }) });
            }
            if (url === `${ISSUER}/jwks`) {
                return json({ keys: [publicJwk] });
            }
            return new Response("unexpected", { status: 500 });
        });
        const cookie = await flightCookie(codec, { state: "state", nonce: "expected" });

        const res = await auth.callback(req(`${ISSUER_PATH}/callback?state=state&code=code`, cookie));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=oidc");
    });

    test("does not trust an unverified email claim", async () => {
        const { auth, codec, users } = await setup();
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
                return json({ keys: [publicJwk] });
            }
            return new Response("unexpected", { status: 500 });
        });
        const cookie = await flightCookie(codec, { state: "state", nonce: "nonce", returnTo: "/admin" });

        const res = await auth.callback(req(`${ISSUER_PATH}/callback?state=state&code=code`, cookie));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/admin");
        const responseCookies = res.headers.getSetCookie();
        expect(responseCookies).toHaveLength(2);
        expect(responseCookies[0]).toContain(`${COOKIE}=`);
        expect(responseCookies[1]).toContain(`${COOKIE}-oidc-sso=`);
        expect(responseCookies[1]).toContain("Max-Age=0");
        expect(res.headers.get("cache-control")).toBe("private, no-store");
        expect(res.headers.get("x-content-type-options")).toBe("nosniff");
        expect(res.headers.get("vary")).toBe("Cookie, Authorization");
        const user = await users.getBySub("sso:sub-1");
        expect(user?.email).toBeUndefined();
        expect(user).not.toHaveProperty("displayName");
    });

    test("token exchange failure redirects without logging the provider body", async () => {
        const { auth, codec } = await setup();
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

        let res: Response;
        try {
            res = await auth.callback(req(`${ISSUER_PATH}/callback?state=state&code=code`, cookie));
        } finally {
            console.warn = originalWarn;
        }

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/login?error=oidc");
        expect(warnings).toEqual(["[oidc:sso] login failed: token_exchange_400"]);
        expect(warnings.join(" ")).not.toContain("provider-secret-detail");
    });
});

const ISSUER_PATH = "https://cms.example/auth/sso";

async function setup() {
    const providers = new InMemoryIdentityProviderRepository();
    await providers.create({
        id: "sso",
        kind: "oidc",
        displayName: "SSO",
        enabled: true,
        issuer: ISSUER,
        clientId: CLIENT_ID,
        clientSecretRef: "${oidc-secret}",
    });
    const secrets = new InMemorySecretStore();
    await secrets.set("oidc-secret", "secret");
    const users = new InMemoryUsersRepository<Role>();
    const resolver = new SubjectResolver<Role>(users, "user");
    const c = codec();
    const auth = new OidcAuthentication<Role>({
        callbackBase: "https://cms.example/auth",
        providers,
        secrets,
        resolver,
        codec: c,
        cookieName: COOKIE,
        loginPagePath: "/login",
        defaultHome: "/admin",
    });
    return { auth, codec: c, users };
}

function req(url: string, cookie?: string): Request {
    return new Request(url, cookie ? { headers: { cookie } } : undefined);
}

function json(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
    });
}

function discovery(): Response {
    return json({
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
    });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        return Promise.resolve(handler(url, init));
    }) as typeof fetch;
}

async function flightCookie(
    c: SignedCookieCodec,
    patch: Partial<{ state: string; nonce: string; codeVerifier: string; returnTo: string }>,
): Promise<string> {
    const token = await c.sign(
        {
            kind: "oidc-flight",
            state: patch.state ?? "state",
            nonce: patch.nonce ?? "nonce",
            codeVerifier: patch.codeVerifier ?? "verifier",
            returnTo: patch.returnTo ?? "/admin",
        },
        600,
    );
    return `${COOKIE}-oidc-sso=${encodeURIComponent(token)}`;
}

async function idToken(input: { nonce: string; email?: string; email_verified?: boolean | string }): Promise<string> {
    return new SignJWT({
        sub: "sub-1",
        name: "Alice",
        nonce: input.nonce,
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.email_verified !== undefined ? { email_verified: input.email_verified } : {}),
    })
        .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
}
