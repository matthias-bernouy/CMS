import type { DefaultRole } from "@bernouy/core";

import { readCookie } from "../cookies";
import type { SessionPayload } from "../session";

import type { KeycloakHandlersDeps } from "./deps";
import { startLogin } from "./loginStart";
import { completeLogin } from "./loginComplete";
import { startLogout } from "./logoutStart";
import { completeLogout } from "./logoutComplete";

export type { KeycloakHandlersDeps } from "./deps";

/**
 * Thin façade over the four OIDC route handlers + a shared `readSession`.
 * Exists so `KeycloakConsumer` can hold a single dependency and forward
 * route registrations without knowing about each handler module.
 */
export class KeycloakHandlers<Role extends string = DefaultRole> {
    constructor(private readonly _d: KeycloakHandlersDeps<Role>) {}

    startLogin(req: Request): Promise<Response> { return startLogin(this._d, req); }
    completeLogin(req: Request): Promise<Response> { return completeLogin(this._d, req); }
    startLogout(req: Request): Promise<Response> { return startLogout(this._d, req); }
    completeLogout(req: Request): Promise<Response> { return completeLogout(this._d, req); }

    async readSession(req: Request): Promise<SessionPayload<Role> | null> {
        const raw = readCookie(req, this._d.cookies.sessionName);
        if (!raw) return null;
        return this._d.codec.readSession<Role>(raw);
    }
}
