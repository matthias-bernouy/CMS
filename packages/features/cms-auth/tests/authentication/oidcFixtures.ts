import { afterEach, beforeAll, beforeEach } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { SignedCookieCodec } from "@bernouy/cms-auth";
import { SubjectResolver } from "cms-auth/core/SubjectResolver";
import { OidcAuthentication } from "cms-auth/default-implementation/authentication/OidcAuthentication";
import { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";
import { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";
import { InMemorySecretStore } from "@bernouy/cms-secrets";

type Role = "admin" | "user";

export const ISSUER = "https://issuer.example";
export const ISSUER_PATH = "https://cms.example/auth/sso";
const CLIENT_ID = "cms-client";
const COOKIE = "cms-session";
const KEY_ID = "test-key";
const codec = () => new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes"));

let privateKey: CryptoKey;
let publicJwk: JWK;
let originalFetch: typeof fetch;

export function installOidcTestHooks(): void {
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
}

export async function setupOidc() {
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
    const signedCookieCodec = codec();
    const auth = new OidcAuthentication<Role>({
        callbackBase: "https://cms.example/auth",
        providers,
        secrets,
        resolver,
        codec: signedCookieCodec,
        cookieName: COOKIE,
        loginPagePath: "/login",
        defaultHome: "/admin",
    });
    return { auth, codec: signedCookieCodec, users };
}

export function oidcRequest(url: string, cookie?: string): Request {
    return new Request(url, cookie ? { headers: { cookie } } : undefined);
}

export function json(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
    });
}

export function discovery(): Response {
    return json({
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
    });
}

export function jwks(): Response {
    return json({ keys: [publicJwk] });
}

export function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        return Promise.resolve(handler(url, init));
    }) as typeof fetch;
}

export async function flightCookie(
    signedCookieCodec: SignedCookieCodec,
    patch: Partial<{ state: string; nonce: string; codeVerifier: string; returnTo: string }>,
): Promise<string> {
    const token = await signedCookieCodec.sign(
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

export async function idToken(input: {
    nonce: string;
    email?: string;
    email_verified?: boolean | string;
}): Promise<string> {
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
