import { jwtVerify } from "jose";

import type { KeycloakHandlersDeps } from "./deps";
import { FLIGHT_COOKIE, readCookie } from "../cookies";
import { exchangeCode } from "../oidc";
import { sanitizeReturnTo } from "../url";

export async function completeLogin<Role extends string>(d: KeycloakHandlersDeps<Role>, req: Request): Promise<Response> {
    const url = new URL(req.url);

    const error = url.searchParams.get("error");
    if (error) return errorRedirect(d, `oidc_${error}`);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return errorRedirect(d, "missing_code_or_state");

    const rawFlight = readCookie(req, FLIGHT_COOKIE);
    if (!rawFlight) return errorRedirect(d, "missing_flight_cookie");

    const flight = await d.codec.verifyFlight(rawFlight);
    if (!flight) return errorRedirect(d, "invalid_flight_cookie");
    if (flight.state !== state) return errorRedirect(d, "state_mismatch");

    const disco = await d.discovery.fetch();
    const tokens = await exchangeCode({
        tokenEndpoint: disco.token_endpoint,
        clientId: d.clientId,
        clientSecret: d.clientSecret,
        code,
        codeVerifier: flight.codeVerifier,
        redirectUri: d.callbackUrl,
    });
    if (!tokens) return errorRedirect(d, "token_exchange_failed");

    const idClaims = await verifyIdToken(d, tokens.id_token);
    if (!idClaims) return errorRedirect(d, "id_token_verification_failed");
    if (idClaims.nonce !== flight.nonce) return errorRedirect(d, "nonce_mismatch");

    const accessClaims = await verifyAccessToken(d, tokens.access_token);
    if (!accessClaims) return errorRedirect(d, "access_token_verification_failed");

    // id_token claims win on overlap — identity is authoritative from the id_token,
    // access_token only contributes role/permission claims.
    const claims = { ...accessClaims, ...idClaims };

    const subject = d.claimsToSubject(claims);
    if (!subject) return errorRedirect(d, "no_subject_from_claims");

    const session = await d.codec.signSession({
        kind: "session",
        sub: subject.identifier,
        role: subject.role,
        displayName: subject.displayName,
        idTokenHint: tokens.id_token,
    });

    const headers = new Headers();
    headers.append("Set-Cookie", d.cookies.session(session, d.codec.sessionTtlSeconds));
    headers.append("Set-Cookie", d.cookies.flight("", 0));
    headers.set("Location", sanitizeReturnTo(flight.returnTo, d.defaultReturnTo));
    return new Response(null, { status: 302, headers });
}

async function verifyIdToken<Role extends string>(d: KeycloakHandlersDeps<Role>, token: string): Promise<Record<string, unknown> | null> {
    try {
        const { payload } = await jwtVerify(token, d.jwks, { issuer: d.issuer, audience: d.clientId });
        return payload as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function verifyAccessToken<Role extends string>(d: KeycloakHandlersDeps<Role>, token: string): Promise<Record<string, unknown> | null> {
    // Audience intentionally not enforced: access tokens target resource servers, not the RP.
    try {
        const { payload } = await jwtVerify(token, d.jwks, { issuer: d.issuer });
        return payload as Record<string, unknown>;
    } catch {
        return null;
    }
}

function errorRedirect<Role extends string>(d: KeycloakHandlersDeps<Role>, reason: string): Response {
    const url = `${d.basePath}/error?reason=${encodeURIComponent(reason)}`;
    const headers = new Headers();
    headers.append("Set-Cookie", d.cookies.flight("", 0));
    headers.set("Location", url);
    return new Response(null, { status: 302, headers });
}
