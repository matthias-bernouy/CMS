import type { OAuthClient, OAuthRecord, OAuthRequest, OAuthStore } from "../interfaces/OAuthStore";
import { hash, OAuthError, opaque, redirectUri, text } from "./primitives";

export async function registerClient(store: OAuthStore, input: Record<string, unknown>, now: number) {
    const uris = input.redirect_uris;
    if (
        !Array.isArray(uris) ||
        !uris.length ||
        uris.length > 10 ||
        (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== "none") ||
        (input.grant_types !== undefined &&
            (!Array.isArray(input.grant_types) ||
                input.grant_types.some((value) => !["authorization_code", "refresh_token"].includes(value)))) ||
        (input.response_types !== undefined &&
            (!Array.isArray(input.response_types) || input.response_types.some((value) => value !== "code")))
    ) {
        throw new OAuthError("invalid_client_metadata");
    }
    const client: OAuthClient = {
        clientId: opaque(),
        name: text(input.client_name ?? "MCP client", 120),
        redirectUris: [...new Set(uris.map(redirectUri))],
    };
    await store.create({
        id: `client:${client.clientId}`,
        revision: 0,
        value: client,
        expiresAt: now + 600_000,
    });
    return {
        client_id: client.clientId,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
    };
}

export async function prepareAuthorization(
    store: OAuthStore,
    resource: string,
    input: Record<string, unknown>,
    now: number,
) {
    if ((await store.list("request:", 1024, undefined, { expiresAfter: now })).length >= 1024) {
        throw new OAuthError("temporarily_unavailable", 503);
    }
    const clientId = text(input.client_id, 128);
    const record = await store.get(`client:${clientId}`);
    const client = record?.value as OAuthClient | undefined;
    const uri = redirectUri(input.redirect_uri);
    if (!client || record!.expiresAt <= now || !client.redirectUris.includes(uri)) {
        throw new OAuthError("invalid_client");
    }
    const challenge = text(input.code_challenge, 128);
    if (
        input.response_type !== "code" ||
        input.code_challenge_method !== "S256" ||
        !/^[A-Za-z0-9_-]{43}$/u.test(challenge) ||
        input.resource !== resource ||
        (input.scope !== undefined && input.scope !== "cms:full")
    ) {
        throw new OAuthError("invalid_request");
    }
    await retainClient(store, clientId, now, 600_000);
    const request: OAuthRequest = { clientId, redirectUri: uri, resource, challenge, state: text(input.state, 1024) };
    const requestId = opaque();
    await store.create({ id: `request:${hash(requestId)}`, revision: 0, value: request, expiresAt: now + 300_000 });
    return { requestId, clientName: client.name, redirectUri: uri, expiresAt: now + 300_000 };
}

export async function currentRecord(store: OAuthStore, id: string, now: number): Promise<OAuthRecord> {
    const record = await store.get(id);
    if (!record || record.expiresAt <= now) {
        throw new OAuthError("invalid_grant");
    }
    return record;
}

/** CAS extends retention without clobbering concurrent approvals or newer metadata. */
export async function retainClient(store: OAuthStore, clientId: string, now: number, lifetime: number) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const current = await currentRecord(store, `client:${clientId}`, now);
        if (current.expiresAt >= now + lifetime) {
            return;
        }
        if (
            await store.replace(
                { ...current, revision: current.revision + 1, expiresAt: now + lifetime },
                current.revision,
            )
        ) {
            return;
        }
    }
    throw new OAuthError("temporarily_unavailable", 503);
}
