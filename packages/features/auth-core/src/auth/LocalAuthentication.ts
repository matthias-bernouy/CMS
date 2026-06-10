import type { Authentication, Subject } from "auth-core/interfaces/Authentication";
import type { SignedCookieCodec } from "auth-core/auth/SignedCookieCodec";
import type { Runner } from "@bernouy/http-runner";
import type { LocalCredentialStore } from "auth-core/interfaces/LocalCredentialStore";
import type { SubjectResolver } from "auth-core/auth/SubjectResolver";
import type { PatRepository } from "auth-core/interfaces/PatRepository";
import type { RateLimiter } from "auth-core/interfaces/RateLimiter";
import { readCookie, setCookie, clearCookie, sanitizeReturnTo } from "auth-core/auth/cookies";

type SessionPayload = { kind: "session"; sub: string };

export type LocalAuthConfig<Role extends string> = {
    /** Identity-provider id this backend represents (provenance tag, e.g. "local"). */
    providerId:        string;
    /** Prefix the login/logout endpoints mount under (e.g. "/auth"). */
    basePath:          string;
    /** Page to send unauthenticated users to (used by `buildLoginUrl`). Full path. */
    loginPagePath:     string;
    /** Full path of the logout endpoint (used by `buildLogoutUrl`). Differs from
     *  `basePath` which is route-registration-relative to the tenant runner. */
    logoutPath:        string;
    credentials:       LocalCredentialStore;
    resolver:          SubjectResolver<Role>;
    codec:             SignedCookieCodec;
    cookieName:        string;
    cookieSecure?:     boolean;
    sessionTtlSeconds?: number;
    /** Redirect target after login when no (safe) `returnTo` is given. */
    defaultHome?:      string;
    /** Optional PAT store. When set, `getSubject` also accepts an
     *  `Authorization: Bearer <pat>` header — the CLI / server-to-server path. */
    pats?:             PatRepository;
    /** Optional brute-force throttle for the password login path, keyed by
     *  email and checked BEFORE argon2 runs; a successful login clears it.
     *  Omit to disable throttling (dev / single-tenant). */
    rateLimit?:        RateLimiter;
};

/**
 * Credential-style `Authentication` backend over a `LocalCredentialStore`
 * (email/password). Registers `POST <basePath>/login` and `GET <basePath>/logout`.
 *
 * The CMS terminates the session: on a successful `verify`, the identity flows
 * through `SubjectResolver` (authn → authz) and a signed session cookie is
 * issued. `getSubject` re-reads the role from the store every call, so role
 * changes take effect without re-login.
 */
export class LocalAuthentication<Role extends string = string> implements Authentication<Role> {

    readonly loginUrl:   string;
    readonly logoutUrl:  string;
    readonly profileUrl = "";

    private readonly _ttl: number;

    constructor(runner: Runner, private readonly cfg: LocalAuthConfig<Role>) {
        this._ttl     = cfg.sessionTtlSeconds ?? 3600;
        this.loginUrl  = cfg.loginPagePath;
        this.logoutUrl = cfg.logoutPath;

        runner.group(cfg.basePath, (r) => {
            r.addEndpoint("POST", "/login",  (req) => this._login(req));
            r.addEndpoint("GET",  "/logout", (req) => this._logout(req));
        });
    }

    buildLoginUrl(returnTo: string): string {
        return `${this.loginUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `${this.logoutUrl}?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(req: Request): Promise<Subject<Role> | null> {
        // Bearer (CLI / server-to-server) takes precedence over the cookie. A
        // presented-but-invalid PAT is rejected outright — it must not silently
        // fall through to whatever cookie the same request happens to carry.
        const bearer = readBearer(req);
        if (bearer) {
            if (!this.cfg.pats) return null;
            const principal = await this.cfg.pats.verify(bearer);
            return principal ? this.cfg.resolver.fromSub(principal.sub) : null;
        }

        const raw = readCookie(req, this.cfg.cookieName);
        if (!raw) return null;
        const payload = await this.cfg.codec.verify<SessionPayload>(raw);
        if (!payload || payload.kind !== "session") return null;
        return this.cfg.resolver.fromSub(payload.sub);
    }

    private async _login(req: Request): Promise<Response> {
        const { email, password, returnTo } = await readCredentials(req);
        const back = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";

        // Throttle by email BEFORE the expensive argon2 verify (brute-force + CPU-DoS).
        const rlKey = email && this.cfg.rateLimit ? `login:email:${email.trim().toLowerCase()}` : null;
        if (rlKey && this.cfg.rateLimit) {
            const { allowed } = await this.cfg.rateLimit.hit(rlKey);
            if (!allowed) return redirect(`${this.cfg.loginPagePath}?error=rate_limited${back}`);
        }

        const identity = email && password ? await this.cfg.credentials.verify(email, password) : null;
        if (!identity) {
            return redirect(`${this.cfg.loginPagePath}?error=1${back}`);
        }

        // A successful login clears the counter so earlier fumbles don't count.
        if (rlKey && this.cfg.rateLimit) await this.cfg.rateLimit.reset(rlKey);

        const subject = await this.cfg.resolver.fromIdentity({ ...identity, provider: this.cfg.providerId });
        const token = await this.cfg.codec.sign({ kind: "session", sub: subject.identifier }, this._ttl);
        const dest  = sanitizeReturnTo(returnTo, this.cfg.defaultHome ?? "/");
        return new Response(null, {
            status:  302,
            headers: { Location: dest, "Set-Cookie": setCookie(this.cfg.cookieName, token, this._ttl, this.cfg.cookieSecure ?? false) },
        });
    }

    private _logout(req: Request): Response {
        const dest = sanitizeReturnTo(new URL(req.url).searchParams.get("returnTo"), this.cfg.defaultHome ?? "/");
        return new Response(null, {
            status:  302,
            headers: { Location: dest, "Set-Cookie": clearCookie(this.cfg.cookieName, this.cfg.cookieSecure ?? false) },
        });
    }
}

async function readCredentials(req: Request): Promise<{ email?: string; password?: string; returnTo?: string }> {
    const url = new URL(req.url);
    let returnTo = url.searchParams.get("returnTo") ?? undefined;
    const ct = req.headers.get("content-type") ?? "";

    if (ct.includes("application/json")) {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        return {
            email:    typeof b.email === "string" ? b.email : undefined,
            password: typeof b.password === "string" ? b.password : undefined,
            returnTo: typeof b.returnTo === "string" ? b.returnTo : returnTo,
        };
    }
    const form = await req.formData().catch(() => null);
    if (form) {
        if (form.get("returnTo")) returnTo = String(form.get("returnTo"));
        return { email: str(form.get("email")), password: str(form.get("password")), returnTo };
    }
    return { returnTo };
}

function readBearer(req: Request): string | null {
    const h = req.headers.get("authorization");
    const m = h ? /^Bearer\s+(.+)$/i.exec(h) : null;
    return m?.[1] ?? null;
}

const str = (v: FormDataEntryValue | null): string | undefined => (typeof v === "string" && v ? v : undefined);
const redirect = (location: string): Response => new Response(null, { status: 302, headers: { Location: location } });
