import type { KeycloakHandlersDeps } from "./deps";
import { FLIGHT_TTL_SECONDS } from "../session";
import { buildAuthorizeUrl } from "../oidc";
import { pkceChallenge, randomUrlSafe } from "../pkce";
import { sanitizeReturnTo } from "../url";

export async function startLogin<Role extends string>(d: KeycloakHandlersDeps<Role>, req: Request): Promise<Response> {
    const url = new URL(req.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") ?? "", d.defaultReturnTo);

    const state = randomUrlSafe(32);
    const nonce = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(64);
    const codeChallenge = await pkceChallenge(codeVerifier);

    const flightCookie = await d.codec.signFlight({ kind: "flight", state, nonce, codeVerifier, returnTo });

    const disco = await d.discovery.fetch();
    const authorize = buildAuthorizeUrl(disco, {
        clientId: d.clientId,
        redirectUri: d.callbackUrl,
        scopes: d.scopes,
        state,
        nonce,
        codeChallenge,
    });

    const headers = new Headers();
    headers.append("Set-Cookie", d.cookies.flight(flightCookie, FLIGHT_TTL_SECONDS));
    headers.set("Location", authorize.toString());
    return new Response(null, { status: 302, headers });
}
