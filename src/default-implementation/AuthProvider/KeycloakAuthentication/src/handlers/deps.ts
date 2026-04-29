import type { createRemoteJWKSet } from "jose";

import type { Subject } from "../../../../../interfaces/Authentication";

import type { Discovery } from "../discovery";
import type { CookieFactory } from "../cookies";
import type { SessionCodec } from "../session";

export type KeycloakHandlersDeps<Role extends string> = {
    issuer: string;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    postLogoutCallbackUrl: string;
    basePath: string;
    defaultReturnTo: string;
    scopes: string[];
    claimsToSubject: (claims: Record<string, unknown>) => Subject<Role> | null;
    discovery: Discovery;
    cookies: CookieFactory;
    codec: SessionCodec;
    jwks: ReturnType<typeof createRemoteJWKSet>;
};
