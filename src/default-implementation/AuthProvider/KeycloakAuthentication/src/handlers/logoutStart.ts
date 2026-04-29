import type { KeycloakHandlersDeps } from "./deps";
import { readCookie } from "../cookies";
import { FLIGHT_TTL_SECONDS } from "../session";
import { buildEndSessionUrl } from "../oidc";
import { sanitizeReturnTo } from "../url";

export async function startLogout<Role extends string>(d: KeycloakHandlersDeps<Role>, req: Request): Promise<Response> {
    const url = new URL(req.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") ?? "", d.defaultReturnTo);

    const rawSession = readCookie(req, d.cookies.sessionName);
    const session = rawSession ? await d.codec.readSession<Role>(rawSession) : null;

    const disco = await d.discovery.fetch();
    const end = buildEndSessionUrl(disco, {
        clientId: d.clientId,
        postLogoutRedirectUri: d.postLogoutCallbackUrl,
        idTokenHint: session?.idTokenHint,
    });

    const stash = await d.codec.signPostLogout({ kind: "post-logout", returnTo });

    const headers = new Headers();
    headers.append("Set-Cookie", d.cookies.clearSession());
    headers.append("Set-Cookie", d.cookies.postLogout(stash, FLIGHT_TTL_SECONDS));
    headers.set("Location", end.toString());
    return new Response(null, { status: 302, headers });
}
