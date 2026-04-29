import { SignJWT, jwtVerify } from "jose";

export const FLIGHT_TTL_SECONDS = 600;

export type FlightPayload = {
    kind: "flight";
    state: string;
    nonce: string;
    codeVerifier: string;
    returnTo: string;
};

export type PostLogoutPayload = {
    kind: "post-logout";
    returnTo: string;
};

export type SessionPayload<Role extends string> = {
    kind: "session";
    sub: string;
    role: Role;
    displayName?: string;
    /** id_token kept verbatim for RP-initiated logout (`id_token_hint`). */
    idTokenHint: string;
};

/**
 * Self-contained HS256 JWT codec for the three cookie payloads (session,
 * flight, post-logout). No server-side store: the cookie IS the state.
 */
export class SessionCodec {
    constructor(
        private readonly _key: Uint8Array,
        readonly sessionTtlSeconds: number,
    ) {}

    signSession<Role extends string>(payload: SessionPayload<Role>): Promise<string> {
        return this._sign(payload, this.sessionTtlSeconds);
    }

    readSession<Role extends string>(raw: string): Promise<SessionPayload<Role> | null> {
        return this._verify<SessionPayload<Role>>(raw, "session");
    }

    signFlight(payload: FlightPayload): Promise<string> {
        return this._sign(payload, FLIGHT_TTL_SECONDS);
    }

    verifyFlight(raw: string): Promise<FlightPayload | null> {
        return this._verify<FlightPayload>(raw, "flight");
    }

    signPostLogout(payload: PostLogoutPayload): Promise<string> {
        return this._sign(payload, FLIGHT_TTL_SECONDS);
    }

    verifyPostLogout(raw: string): Promise<PostLogoutPayload | null> {
        return this._verify<PostLogoutPayload>(raw, "post-logout");
    }

    private _sign(payload: object, ttlSeconds: number): Promise<string> {
        return new SignJWT({ ...payload } as Record<string, unknown>)
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime(`${ttlSeconds}s`)
            .sign(this._key);
    }

    private async _verify<T extends { kind: string }>(raw: string, kind: T["kind"]): Promise<T | null> {
        try {
            const { payload } = await jwtVerify(raw, this._key, { algorithms: ["HS256"] });
            if ((payload as { kind?: string }).kind !== kind) return null;
            return payload as unknown as T;
        } catch {
            return null;
        }
    }
}
