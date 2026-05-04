import type { KeycloakHandlersDeps } from "./deps";
import { POST_LOGOUT_COOKIE, readCookie } from "../cookies";
import { sanitizeReturnTo } from "../url";

export async function completeLogout<Role extends string>(d: KeycloakHandlersDeps<Role>, req: Request): Promise<Response> {
    const raw = readCookie(req, POST_LOGOUT_COOKIE);
    const stash = raw ? await d.codec.verifyPostLogout(raw) : null;
    const returnTo = stash ? sanitizeReturnTo(stash.returnTo, d.defaultReturnTo) : d.defaultReturnTo;

    const headers = new Headers();
    headers.append("Set-Cookie", d.cookies.postLogout("", 0));
    headers.set("Location", returnTo);
    return new Response(null, { status: 302, headers });
}
