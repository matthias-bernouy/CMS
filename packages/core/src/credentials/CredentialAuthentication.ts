import type { Authentication, DefaultRole, Subject } from "../interfaces/Authentication";
import { sha256Hex } from "../utilities/crypto";
import type { Credential } from "./Credential";
import type { CredentialRepository } from "./CredentialRepository";

/**
 * `Authentication<Role>` backed by a `CredentialRepository`. Reads
 * `Authorization: Bearer <token>`, looks up the matching credential by
 * SHA-256 hash, rejects revoked/expired entries, and projects the credential
 * into a `Subject<Role>` via the caller-supplied mapper.
 *
 * Designed to compose with browser-loginable providers via
 * `CompositeAuthentication`: this instance reports empty `loginUrl` /
 * `logoutUrl` / `profileUrl` (it is consume-only), so the composite
 * delegates URL fields to the cookie child.
 *
 * The full `Credential` (including consumer-extended fields like `bucketId`)
 * is stashed on a side WeakMap during `getSubject` and retrievable via
 * `getCredential(req)` from any handler downstream of the auth check. This
 * preserves type information that does not fit `Subject`.
 */
export class CredentialAuthentication<
    T extends Credential = Credential,
    Role extends string = DefaultRole,
> implements Authentication<Role> {

    readonly loginUrl   = "";
    readonly logoutUrl  = "";
    readonly profileUrl = "";

    private readonly _repo:          CredentialRepository<T>;
    private readonly _subjectMapper: (cred: T) => Subject<Role>;

    constructor(repo: CredentialRepository<T>, subjectMapper: (cred: T) => Subject<Role>) {
        this._repo          = repo;
        this._subjectMapper = subjectMapper;
    }

    buildLoginUrl():  string { return ""; }
    buildLogoutUrl(): string { return ""; }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        const cleartext = extractBearer(req);
        if (!cleartext) return null;

        const cred = await this._repo.getByTokenHash(await sha256Hex(cleartext));
        if (!cred || cred.revokedAt) return null;
        if (cred.expiresAt && cred.expiresAt.getTime() <= Date.now()) return null;

        credentialByRequest.set(req, cred);
        return this._subjectMapper(cred);
    }
}

/**
 * Returns the full `Credential` resolved by an upstream `CredentialAuthentication`
 * for this request, or `null` if none ran. Callers typically downcast to their
 * consumer-extended type — see `requireCredential` for the throw-on-absence variant.
 */
export function getCredential<T extends Credential = Credential>(req: Request): T | null {
    return (credentialByRequest.get(req) as T | undefined) ?? null;
}

/**
 * Like `getCredential`, but throws if no credential is attached to the request.
 * Use in handlers mounted under a `CredentialAuthentication`-guarded surface,
 * where absence is a wiring bug, not a routine state:
 *
 *   const bucketId = requireCredential<BucketCredential>(req).bucketId;
 */
export function requireCredential<T extends Credential = Credential>(req: Request): T {
    const cred = getCredential<T>(req);
    if (!cred) throw new Error(
        "requireCredential: no credential resolved for this request — was the route mounted under CredentialAuthentication?",
    );
    return cred;
}

function extractBearer(req: Request): string | null {
    const header = req.headers.get("authorization");
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1]!.trim() : null;
}

// `serveApiFolder` loads handlers via runtime dynamic-import from absolute
// source paths, while the auth class is instantiated from the package's
// regular import graph. In some packaging shapes that produces two distinct
// module instances and thus two distinct WeakMaps. Pin the map on
// `globalThis` via a registered Symbol so that auth-side `set` and
// handler-side `get` always hit the same instance.
const SHARED_KEY = Symbol.for("@bernouy/core::CredentialAuthentication::credentialByRequest");
type CredentialByRequestMap = WeakMap<Request, Credential>;
const credentialByRequest: CredentialByRequestMap = ((): CredentialByRequestMap => {
    const g = globalThis as unknown as { [k: symbol]: CredentialByRequestMap | undefined };
    return g[SHARED_KEY] ?? (g[SHARED_KEY] = new WeakMap());
})();
