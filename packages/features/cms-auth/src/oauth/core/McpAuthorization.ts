import { InMemoryRateLimiter, type RateLimiter } from "@bernouy/rate-limiter";
import type { OAuthClient, OAuthGrant, OAuthPolicy, OAuthRequest, OAuthStore } from "../interfaces/OAuthStore";
import { currentRecord, prepareAuthorization, registerClient, retainClient } from "./clients";
import { hash, OAuthError, opaque, text, isLocalHostname } from "./primitives";
import { resolveAccess, rotateRefresh, tokens } from "./tokens";

/** Provider-owned authorization. Policy is injected independently of authentication subjects. */
export class McpAuthorization {
    constructor(
        private readonly store: OAuthStore,
        private readonly policy: OAuthPolicy,
        readonly resource: string,
        private readonly key: Uint8Array,
        private readonly now = Date.now,
        private readonly publicLimiter: RateLimiter = new InMemoryRateLimiter({ limit: 32, windowSeconds: 60 }),
    ) {
        const url = new URL(resource);
        if (
            key.byteLength < 32 ||
            url.username ||
            url.password ||
            url.hash ||
            url.search ||
            (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHostname(url.hostname)))
        ) {
            throw new TypeError("Invalid MCP authorization configuration");
        }
    }
    async register(input: Record<string, unknown>) {
        await this.publicBudget("registration");
        await this.store.pruneExpired(this.now());
        return registerClient(this.store, input, this.now());
    }
    async prepare(input: Record<string, unknown>) {
        await this.publicBudget("authorization");
        return prepareAuthorization(this.store, this.resource, input, this.now());
    }
    async authorize(requestId: string, subjectId: string) {
        await this.assertAdministrator(subjectId);
        const request = await currentRecord(this.store, `request:${hash(text(requestId, 128))}`, this.now());
        await retainClient(this.store, (request.value as OAuthRequest).clientId, this.now(), 365 * 86400_000);
        if (request.revision !== 0 || !(await this.store.replace({ ...request, revision: 1 }, 0))) {
            throw new OAuthError("invalid_grant");
        }
        const value = request.value as OAuthRequest;
        const code = opaque();
        await this.store.create({
            id: `code:${hash(code)}`,
            revision: 0,
            value: { ...value, subjectId },
            expiresAt: this.now() + 60_000,
        });
        const redirect = new URL(value.redirectUri);
        redirect.searchParams.set("code", code);
        redirect.searchParams.set("state", value.state);
        return { redirectUri: redirect.href };
    }
    async deny(requestId: string) {
        const request = await currentRecord(this.store, `request:${hash(text(requestId, 128))}`, this.now());
        if (request.revision !== 0 || !(await this.store.replace({ ...request, revision: 1 }, 0))) {
            throw new OAuthError("invalid_grant");
        }
        const value = request.value as OAuthRequest;
        const redirect = new URL(value.redirectUri);
        redirect.searchParams.set("error", "access_denied");
        redirect.searchParams.set("state", value.state);
        return { redirectUri: redirect.href };
    }
    async exchange(input: Record<string, unknown>) {
        if (input.grant_type === "refresh_token") {
            return rotateRefresh(this.store, this.policy, this.resource, this.key, input, this.now());
        }
        if (input.grant_type !== "authorization_code") {
            throw new OAuthError("unsupported_grant_type");
        }
        const code = await currentRecord(this.store, `code:${hash(text(input.code, 128))}`, this.now());
        const value = code.value as OAuthRequest & { subjectId: string };
        const verifier = text(input.code_verifier, 128);
        if (
            !/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier) ||
            hash(verifier) !== value.challenge ||
            input.client_id !== value.clientId ||
            input.redirect_uri !== value.redirectUri ||
            input.resource !== this.resource ||
            value.resource !== this.resource ||
            code.revision !== 0
        ) {
            throw new OAuthError("invalid_grant");
        }
        await this.assertAdministrator(value.subjectId);
        if (!(await this.store.replace({ ...code, revision: 1 }, 0))) {
            throw new OAuthError("invalid_grant");
        }
        const client = (await currentRecord(this.store, `client:${value.clientId}`, this.now())).value as OAuthClient;
        const id = opaque();
        const refresh = `${id}.${opaque()}`;
        const grant: OAuthGrant = {
            ...value,
            clientName: client.name,
            createdAt: this.now(),
            refreshHash: hash(refresh),
            previousRefreshHashes: [],
            revoked: false,
        };
        const record = { id: `grant:${id}`, revision: 0, value: grant, expiresAt: this.now() + 30 * 86400_000 };
        await this.store.create(record);
        return tokens(record, refresh, this.resource, this.key, this.now());
    }
    resolve(token: string) {
        return resolveAccess(this.store, this.policy, this.resource, this.key, token, this.now());
    }
    async list(subjectId: string, input: { cursor?: unknown; limit?: unknown } = {}) {
        await this.assertAdministrator(subjectId);
        const limit = input.limit ?? 50;
        if (
            !Number.isSafeInteger(limit) ||
            Number(limit) < 1 ||
            Number(limit) > 100 ||
            (input.cursor !== undefined &&
                (typeof input.cursor !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(input.cursor)))
        ) {
            throw new OAuthError("invalid_request");
        }
        const records = await this.store.list("grant:", Number(limit) + 1, subjectId, {
            expiresAfter: this.now(),
            ...(input.cursor ? { after: `grant:${input.cursor}` } : {}),
        });
        const page = records.slice(0, Number(limit));
        return {
            items: page.map((record) => {
                const grant = record.value as OAuthGrant;
                return {
                    id: record.id.slice(6),
                    clientName: grant.clientName,
                    createdAt: new Date(grant.createdAt).toISOString(),
                    expiresAt: new Date(record.expiresAt).toISOString(),
                    revoked: grant.revoked,
                    mode: "full_access",
                };
            }),
            nextCursor: records.length > Number(limit) ? page.at(-1)!.id.slice(6) : null,
        };
    }
    async revoke(id: string, subjectId: string) {
        await this.assertAdministrator(subjectId);
        const record = await currentRecord(this.store, `grant:${text(id, 128)}`, this.now());
        const grant = record.value as OAuthGrant;
        if (grant.subjectId !== subjectId) {
            throw new OAuthError("access_denied", 403);
        }
        if (
            !grant.revoked &&
            !(await this.store.replace(
                { ...record, revision: record.revision + 1, value: { ...grant, revoked: true } },
                record.revision,
            ))
        ) {
            throw new OAuthError("invalid_grant");
        }
        return { revoked: true };
    }
    private async publicBudget(key: string) {
        if (!(await this.publicLimiter.hit(key)).allowed) {
            throw new OAuthError("temporarily_unavailable", 429);
        }
    }
    private async assertAdministrator(subjectId: string) {
        if (!(await this.policy.canConnect(subjectId))) {
            throw new OAuthError("access_denied", 403);
        }
    }
}
