import { createHash, randomBytes } from "node:crypto";
import type { SignedCookieCodec } from "cms-auth/core/SignedCookieCodec";
import type { IdentityProvider } from "cms-auth/interfaces/IdentityProvider";
import type { OidcMetadata } from "cms-auth/default-implementation/authentication/oidc/OidcMetadataCache";

export type FlightPayload = {
    kind: "oidc-flight";
    state: string;
    nonce: string;
    codeVerifier: string;
    returnTo: string;
};

type LoginFlight = FlightPayload & {
    challenge: string;
    token: string;
};

export async function createLoginFlight(codec: SignedCookieCodec, returnTo: string): Promise<LoginFlight> {
    const codeVerifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const state = randomBytes(16).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    const payload: FlightPayload = { kind: "oidc-flight", state, nonce, codeVerifier, returnTo };
    return { ...payload, challenge, token: await codec.sign(payload, 600) };
}

export function buildAuthorizationUrl(
    metadata: OidcMetadata,
    provider: IdentityProvider,
    callbackBase: string,
    flight: LoginFlight,
): URL {
    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", provider.clientId!);
    url.searchParams.set("redirect_uri", `${callbackBase}/${provider.id}/callback`);
    url.searchParams.set("scope", (provider.scopes ?? ["openid", "email", "profile"]).join(" "));
    url.searchParams.set("state", flight.state);
    url.searchParams.set("nonce", flight.nonce);
    url.searchParams.set("code_challenge", flight.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
}
