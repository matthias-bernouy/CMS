import { describe, test, expect } from "bun:test";
import { requireRole, type RequireRoleOptions } from "src/auth/requireRole";
import type { Authentication, DefaultRole, Subject } from "src/interfaces/Authentication";

type Role = "admin" | "user" | "tenant";

function makeAuth(subject: Subject<Role> | null): Authentication<Role> {
    return {
        loginUrl:    "/login",
        logoutUrl:   "/logout",
        profileUrl:  "/profile",
        buildLoginUrl:  (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        buildLogoutUrl: () => "/logout",
        getSubject:  async () => subject,
    };
}

const NEXT_OK = async () => new Response("OK", { status: 200 });

async function run(
    authSubject: Subject<Role> | null,
    role: Role,
    req: Request,
    options: RequireRoleOptions<Role> = {},
): Promise<Response> {
    const mw = requireRole(makeAuth(authSubject), role, options);
    return mw(req, NEXT_OK);
}

describe("requireRole — role check", () => {
    test("returns 401 JSON when no subject (default onUnauthenticated)", async () => {
        const res = await run(null, "admin", new Request("http://x/y"));
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ ok: false, error: { code: "unauthenticated", message: "Authentication required." } });
    });

    test("returns 403 JSON when subject role mismatches (default onForbidden)", async () => {
        const res = await run({ identifier: "u1", role: "user" }, "admin", new Request("http://x/y"));
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ ok: false, error: { code: "forbidden", message: "Insufficient permissions." } });
    });

    test("calls next() when role matches", async () => {
        const res = await run({ identifier: "u1", role: "admin" }, "admin", new Request("http://x/y"));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("OK");
    });

    test("custom onUnauthenticated is used when provided", async () => {
        const res = await run(null, "admin", new Request("http://x/y"), {
            onUnauthenticated: () => new Response(null, { status: 302, headers: { Location: "/login" } }),
        });
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("/login");
    });

    test("custom onForbidden is used when provided", async () => {
        const res = await run({ identifier: "u1", role: "user" }, "admin", new Request("http://x/y"), {
            onForbidden: () => new Response("nope", { status: 403 }),
        });
        expect(res.status).toBe(403);
        expect(await res.text()).toBe("nope");
    });
});

describe("requireRole — CSRF policy", () => {
    const xOriginPost = (origin: string) => new Request("http://server.example/api/x", {
        method:  "POST",
        headers: { authorization: "Bearer t", origin },
    });
    const sameOriginPost = () => new Request("http://server.example/api/x", {
        method:  "POST",
        headers: { origin: "http://server.example" },
    });
    const adminSubject = { identifier: "u1", role: "admin" as const };

    test("default 'off' lets cross-origin POST pass (no CSRF check)", async () => {
        const res = await run(adminSubject, "admin", xOriginPost("http://attacker"), {});
        expect(res.status).toBe(200);
    });

    test("'cookie-only' rejects cross-origin POST when no Authorization header", async () => {
        const req = new Request("http://server.example/api/x", {
            method:  "POST",
            headers: { origin: "http://attacker" },
        });
        const res = await run(adminSubject, "admin", req, { csrf: "cookie-only" });
        expect(res.status).toBe(403);
        expect(await res.text()).toMatch(/CSRF/);
    });

    test("'cookie-only' SKIPS CSRF when Authorization header present (bearer is CSRF-immune)", async () => {
        const res = await run(adminSubject, "admin", xOriginPost("http://attacker"), { csrf: "cookie-only" });
        expect(res.status).toBe(200);
    });

    test("'cookie-only' lets same-origin POST pass even without Authorization", async () => {
        const res = await run(adminSubject, "admin", sameOriginPost(), { csrf: "cookie-only" });
        expect(res.status).toBe(200);
    });

    test("'cookie-only' lets GET pass regardless of origin (only mutating methods checked)", async () => {
        const req = new Request("http://server.example/api/x", { headers: { origin: "http://attacker" } });
        const res = await run(adminSubject, "admin", req, { csrf: "cookie-only" });
        expect(res.status).toBe(200);
    });

    test("'always' rejects cross-origin POST EVEN with Authorization header", async () => {
        const res = await run(adminSubject, "admin", xOriginPost("http://attacker"), { csrf: "always" });
        expect(res.status).toBe(403);
    });

    test("CSRF check is lenient on missing Origin/Referer (some legitimate clients omit them)", async () => {
        const req = new Request("http://server.example/api/x", { method: "POST" });
        const res = await run(adminSubject, "admin", req, { csrf: "cookie-only" });
        expect(res.status).toBe(200);
    });

    test("CSRF rejects malformed Origin", async () => {
        const req = new Request("http://server.example/api/x", { method: "POST", headers: { origin: "not-a-url" } });
        const res = await run(adminSubject, "admin", req, { csrf: "cookie-only" });
        expect(res.status).toBe(403);
        expect(await res.text()).toMatch(/invalid origin/);
    });
});

describe("requireRole — generic role typing", () => {
    test("works with the default role union", async () => {
        const auth: Authentication = {
            loginUrl: "", logoutUrl: "", profileUrl: "",
            buildLoginUrl: () => "", buildLogoutUrl: () => "",
            getSubject: async () => ({ identifier: "u", role: "admin" } satisfies Subject<DefaultRole>),
        };
        const res = await requireRole(auth, "admin")(new Request("http://x/"), NEXT_OK);
        expect(res.status).toBe(200);
    });
});
