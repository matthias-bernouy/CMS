import { describe, test, expect } from "bun:test";
import { SignedCookieCodec } from "@bernouy/cms-auth";
import { LocalAuthentication } from "cms-auth/default-implementation/LocalAuthentication";
import { localLoginHandler } from "cms-auth/http/authHandlers";
import { SubjectResolver } from "cms-auth/core/SubjectResolver";
import { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";
import { InMemoryLocalCredentialStore } from "cms-auth/default-implementation/memory/InMemoryLocalCredentialStore";
import { InMemoryPatRepository } from "cms-auth/default-implementation/memory/InMemoryPatRepository";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";

type Role = "admin" | "user";
type Handler = (req: Request) => Promise<Response> | Response;

function setup(opts: { rateLimit?: InMemoryRateLimiter } = {}) {
    const users = new InMemoryUsersRepository<Role>();
    const resolver = new SubjectResolver<Role>(users, "user");
    const credentials = new InMemoryLocalCredentialStore();
    const pats = new InMemoryPatRepository();
    const codec = new SignedCookieCodec(new TextEncoder().encode("test-secret-key-at-least-16-bytes"));
    const auth = new LocalAuthentication<Role>({
        providerId: "local",
        loginPagePath: "/cms/t/login",
        logoutPath: "/cms/t/auth/logout",
        credentials, resolver, codec, pats,
        cookieName: "cms-t-session",
        defaultHome: "/cms/t/admin/pages",
        ...(opts.rateLimit ? { rateLimit: opts.rateLimit } : {}),
    });
    const routes: Record<string, Handler> = {
        "POST /login": (req) => localLoginHandler(auth, req),
    };
    return { auth, routes, users, resolver, credentials, pats, codec };
}

const loginReq = (email: string, password: string) =>
    new Request("http://x/cms/t/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
const login = (routes: Record<string, Handler>, email: string, pw: string) => routes["POST /login"]!(loginReq(email, pw));
const loc = (res: Response) => res.headers.get("location") ?? "";
const cookie = (res: Response) => res.headers.get("set-cookie") ?? "";

describe("LocalAuthentication login", () => {
    test("valid credentials → 302 home + session cookie", async () => {
        const { routes, credentials } = setup();
        await credentials.create({ email: "a@x.com", password: "pw" });
        const res = await login(routes, "a@x.com", "pw");
        expect(res.status).toBe(302);
        expect(loc(res)).toBe("/cms/t/admin/pages");
        expect(cookie(res)).toContain("cms-t-session=");
    });

    test("unverified credentials cannot create a session", async () => {
        const { routes, credentials } = setup();
        await credentials.create({ email: "a@x.com", password: "pw", emailVerified: false });
        const res = await login(routes, "a@x.com", "pw");
        expect(loc(res)).toContain("error=1");
        expect(cookie(res)).not.toContain("cms-t-session=");
    });

    test("wrong password → ?error=1, no cookie", async () => {
        const { routes, credentials } = setup();
        await credentials.create({ email: "a@x.com", password: "pw" });
        const res = await login(routes, "a@x.com", "nope");
        expect(loc(res)).toContain("error=1");
        expect(cookie(res)).not.toContain("cms-t-session=");
    });

    test("throttles once the per-email limit is exceeded", async () => {
        const { routes, credentials } = setup({ rateLimit: new InMemoryRateLimiter({ limit: 2, windowSeconds: 60 }) });
        await credentials.create({ email: "a@x.com", password: "pw" });
        expect(loc(await login(routes, "a@x.com", "no"))).toContain("error=1");
        expect(loc(await login(routes, "a@x.com", "no"))).toContain("error=1");
        expect(loc(await login(routes, "a@x.com", "no"))).toContain("error=rate_limited");
    });

    test("a successful login resets the counter", async () => {
        const { routes, credentials } = setup({ rateLimit: new InMemoryRateLimiter({ limit: 2, windowSeconds: 60 }) });
        await credentials.create({ email: "a@x.com", password: "pw" });
        await login(routes, "a@x.com", "no");                          // count 1
        expect(cookie(await login(routes, "a@x.com", "pw"))).toContain("cms-t-session="); // count 2 → success → reset
        // Counter cleared: without the reset this 3rd attempt would be rate_limited.
        expect(loc(await login(routes, "a@x.com", "no"))).toContain("error=1");
    });

    test("unsafe returnTo falls back to the configured home", async () => {
        const { routes, credentials } = setup();
        await credentials.create({ email: "a@x.com", password: "pw" });
        const req = new Request("http://x/cms/t/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "a@x.com", password: "pw", returnTo: "/\\evil.com" }),
        });
        const res = await routes["POST /login"]!(req);
        expect(loc(res)).toBe("/cms/t/admin/pages");
    });
});

describe("LocalAuthentication.getSubject", () => {
    test("valid session cookie → subject (role read from the store)", async () => {
        const { auth, resolver, codec } = setup();
        const subject = await resolver.fromIdentity({ sub: "u1", provider: "local", displayName: "Bob" });
        const token = await codec.sign({ kind: "session", sub: subject.identifier }, 3600);
        const got = await auth.getSubject(new Request("http://x/cms/t/admin", { headers: { cookie: `cms-t-session=${token}` } }));
        expect(got?.identifier).toBe("local:u1");
        expect(got?.role).toBe("user");
    });

    test("valid bearer PAT → subject", async () => {
        const { auth, resolver, pats } = setup();
        const subject = await resolver.fromIdentity({ sub: "u1", provider: "local" });
        const { token } = await pats.create({ sub: subject.identifier, name: "cli" });
        const got = await auth.getSubject(new Request("http://x/cms/t/api/x", { headers: { authorization: `Bearer ${token}` } }));
        expect(got?.identifier).toBe("local:u1");
    });

    test("an invalid bearer is rejected and does NOT fall back to a valid cookie", async () => {
        const { auth, resolver, codec } = setup();
        const subject = await resolver.fromIdentity({ sub: "u1", provider: "local" });
        const token = await codec.sign({ kind: "session", sub: subject.identifier }, 3600);
        const req = new Request("http://x/cms/t/api/x", {
            headers: { authorization: "Bearer pat_bogus", cookie: `cms-t-session=${token}` },
        });
        expect(await auth.getSubject(req)).toBeNull();
    });

    test("no credentials → null", async () => {
        const { auth } = setup();
        expect(await auth.getSubject(new Request("http://x/cms/t/admin"))).toBeNull();
    });
});
