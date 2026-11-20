import type { OAuthGrant, OAuthPolicy, OAuthStore } from "../interfaces/OAuthStore";
import { OAuthError, readAccessToken } from "./primitives";
import { currentRecord } from "./clients";

export async function resolveAccessWithAuthority(
    store: OAuthStore,
    policy: OAuthPolicy,
    resource: string,
    key: Uint8Array,
    token: string,
    now: number,
) {
    let claims: Record<string, unknown>;
    try {
        claims = readAccessToken(token, key);
    } catch {
        throw new OAuthError("invalid_token", 401);
    }
    if (
        claims.aud !== resource ||
        claims.iss !== new URL(resource).origin ||
        typeof claims.exp !== "number" ||
        !Number.isSafeInteger(claims.exp) ||
        claims.exp <= now / 1000 ||
        typeof claims.grant !== "string"
    ) {
        throw new OAuthError("invalid_token", 401);
    }
    const record = await currentRecord(store, claims.grant, now).catch(() => {
        throw new OAuthError("invalid_token", 401);
    });
    const grant = record.value as OAuthGrant;
    if (
        grant.revoked ||
        grant.resource !== resource ||
        claims.sub !== grant.subjectId ||
        claims.revision !== record.revision
    ) {
        throw new OAuthError("invalid_token", 401);
    }
    const authority = policy.inspectAuthority ? await policy.inspectAuthority(grant.subjectId) : undefined;
    if (authority === null || (authority === undefined && !(await policy.canConnect(grant.subjectId)))) {
        throw new OAuthError("invalid_token", 401);
    }
    return {
        principal: { subjectId: grant.subjectId, connectionId: record.id.slice(6), mode: "full_access" as const },
        authority,
    };
}
