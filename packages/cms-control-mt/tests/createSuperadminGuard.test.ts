import { describe, test, expect } from "bun:test";
import type { Authentication, Subject } from "@bernouy/core";
import { createSuperadminGuard } from "src/core/superadmin/createSuperadminGuard";
import type { SuperadminRole } from "src/exports/MtControlCms";

function makeAuth(subject: Subject<SuperadminRole> | null): Authentication<SuperadminRole> {
    return {
        loginUrl:    "/superadmin/auth/login",
        logoutUrl:   "/superadmin/auth/logout",
        profileUrl:  "/superadmin/auth/profile",
        buildLoginUrl:  (returnTo: string) => `/superadmin/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
        buildLogoutUrl: () => "/superadmin/auth/logout",
        getSubject:  async () => subject,
    };
}

const NEXT_OK = async () => new Response("OK", { status: 200 });

describe("createSuperadminGuard — dual response shaping", () => {
    test("API path + no subject → 401 JSON envelope", async () => {
        const guard = createSuperadminGuard(makeAuth(null));
        const res = await guard(new Request("http://x/superadmin/api/tenants"), NEXT_OK);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toEqual({ ok: false, error: { code: "unauthorized", message: "Not authenticated." } });
    });

    test("non-API path + no subject → 302 redirect to login with returnTo", async () => {
        const guard = createSuperadminGuard(makeAuth(null));
        const res = await guard(new Request("http://x/superadmin/foo"), NEXT_OK);
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("/superadmin/auth/login?returnTo=%2Fsuperadmin%2Ffoo");
    });

    test("API path + wrong role → 403 JSON envelope", async () => {
        const guard = createSuperadminGuard(makeAuth({ identifier: "u", role: "user" }));
        const res = await guard(new Request("http://x/superadmin/api/tenants"), NEXT_OK);
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.code).toBe("forbidden");
    });

    test("non-API path + wrong role → 403 plain text", async () => {
        const guard = createSuperadminGuard(makeAuth({ identifier: "u", role: "user" }));
        const res = await guard(new Request("http://x/superadmin/foo"), NEXT_OK);
        expect(res.status).toBe(403);
        expect(await res.text()).toBe("Forbidden");
    });

    test("subject with role superadmin passes through to next()", async () => {
        const guard = createSuperadminGuard(makeAuth({ identifier: "u", role: "superadmin" }));
        const res = await guard(new Request("http://x/superadmin/foo"), NEXT_OK);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("OK");
    });

    test("bearer-authenticated mutating request skips CSRF (cookie-only mode)", async () => {
        const guard = createSuperadminGuard(makeAuth({ identifier: "u", role: "superadmin" }));
        const res = await guard(new Request("http://x/superadmin/api/tenants", {
            method:  "POST",
            headers: { authorization: "Bearer t", origin: "http://attacker" },
        }), NEXT_OK);
        expect(res.status).toBe(200);
    });

    test("cookie-authenticated mutating cross-origin request is CSRF-rejected", async () => {
        const guard = createSuperadminGuard(makeAuth({ identifier: "u", role: "superadmin" }));
        const res = await guard(new Request("http://x/superadmin/api/tenants", {
            method:  "POST",
            headers: { origin: "http://attacker" },
        }), NEXT_OK);
        expect(res.status).toBe(403);
        expect(await res.text()).toMatch(/CSRF/);
    });
});
