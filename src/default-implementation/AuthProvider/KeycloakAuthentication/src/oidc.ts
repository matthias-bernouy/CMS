import type { DiscoveryDocument } from "./discovery";

/**
 * Exchanges an authorization code for tokens at the IdP's `token_endpoint`,
 * using PKCE (`code_verifier`) and confidential-client credentials.
 * Returns `null` on any non-2xx response or missing tokens.
 */
export async function exchangeCode(params: {
    tokenEndpoint: string;
    clientId: string;
    clientSecret: string;
    code: string;
    codeVerifier: string;
    redirectUri: string;
}): Promise<{ id_token: string; access_token: string } | null> {
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code_verifier: params.codeVerifier,
    });
    const res = await fetch(params.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id_token?: string; access_token?: string };
    if (!json.id_token || !json.access_token) return null;
    return { id_token: json.id_token, access_token: json.access_token };
}

export function buildAuthorizeUrl(disco: DiscoveryDocument, params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    state: string;
    nonce: string;
    codeChallenge: string;
}): URL {
    const url = new URL(disco.authorization_endpoint);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", params.scopes.join(" "));
    url.searchParams.set("state", params.state);
    url.searchParams.set("nonce", params.nonce);
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
}

export function buildEndSessionUrl(disco: DiscoveryDocument, params: {
    clientId: string;
    postLogoutRedirectUri: string;
    idTokenHint?: string;
}): URL {
    const url = new URL(disco.end_session_endpoint);
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("post_logout_redirect_uri", params.postLogoutRedirectUri);
    if (params.idTokenHint) url.searchParams.set("id_token_hint", params.idTokenHint);
    return url;
}
