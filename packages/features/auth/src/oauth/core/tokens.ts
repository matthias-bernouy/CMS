import type { OAuthGrant, OAuthPolicy, OAuthRecord, OAuthStore } from "../interfaces/OAuthStore";
import { accessToken, hash, OAuthError, opaque, text } from "./primitives";
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
