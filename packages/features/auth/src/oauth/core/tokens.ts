import type { OAuthGrant, OAuthPolicy, OAuthRecord, OAuthStore } from "../interfaces/OAuthStore";
import { accessToken, hash, OAuthError, opaque, readAccessToken, text } from "./primitives";
import { currentRecord } from "./clients";

export function tokens(record: OAuthRecord, refresh: string, resource: string, key: Uint8Array, now: number) {
    const grant = record.value as OAuthGrant;
    return {
        access_token: accessToken(
            {
                grant: record.id,
                sub: grant.subjectId,
                aud: resource,
                iss: new URL(resource).origin,
                revision: record.revision,
                exp: Math.floor((now + 900_000) / 1000),
            },
            key,
        ),
        token_type: "Bearer",
        expires_in: 900,
        refresh_token: refresh,
        scope: "cms:full",
    };
}

export async function resolveAccess(
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
        claims.revision !== record.revision ||
        !(await policy.canConnect(grant.subjectId))
    ) {
        throw new OAuthError("invalid_token", 401);
    }
    return { subjectId: grant.subjectId, connectionId: record.id.slice(6), mode: "full_access" as const };
}

export async function rotateRefresh(
    store: OAuthStore,
    policy: OAuthPolicy,
    resource: string,
    key: Uint8Array,
    input: Record<string, unknown>,
    now: number,
) {
    const supplied = text(input.refresh_token, 512);
    const [id] = supplied.split(".");
    const record = await currentRecord(store, `grant:${id}`, now);
    const grant = record.value as OAuthGrant;
    if (
        grant.revoked ||
        input.client_id !== grant.clientId ||
        input.resource !== resource ||
        grant.resource !== resource ||
        !(await policy.canConnect(grant.subjectId))
    ) {
        throw new OAuthError("invalid_grant");
    }
    const digest = hash(supplied);
    if (digest !== grant.refreshHash) {
        if (grant.previousRefreshHashes.includes(digest)) {
            await store.replace(
                { ...record, revision: record.revision + 1, value: { ...grant, revoked: true } },
                record.revision,
            );
        }
        throw new OAuthError("invalid_grant");
    }
    const refresh = `${id}.${opaque()}`;
    const next = {
        ...record,
        revision: record.revision + 1,
        value: {
            ...grant,
            refreshHash: hash(refresh),
            previousRefreshHashes: [...grant.previousRefreshHashes, grant.refreshHash].slice(-128),
        },
    };
    if (!(await store.replace(next, record.revision))) {
        throw new OAuthError("invalid_grant");
    }
    return tokens(next, refresh, resource, key, now);
}
