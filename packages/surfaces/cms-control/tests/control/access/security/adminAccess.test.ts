import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication, type Authentication } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import {
    createAuthenticatedControlGuard,
    createControlAccessGuard,
    createControlApiAuthorizationGuard,
} from "cms-control/core/admin/control/adminAccess";
import { createControlMaintenanceGuard } from "cms-control/core/admin/control/maintenance";

describe("Control authenticated access", () => {
    test("allows authenticated members through the Control guard", async () => {
        expect(await status("GET", "/cms/api/users")).toBe(200);
        expect(await status("POST", "/cms/.cms/call/commerce/refund")).toBe(200);
        expect(await status("GET", "/cms/admin/settings/secrets")).toBe(200);
    });
});

describe("Control machine route authentication", () => {
    test("returns an API response instead of a login redirect for CMS transports", async () => {
        const guard = createAuthenticatedControlGuard("/cms", unauthenticated());
        const response = await guard(
            new Request("http://localhost/cms/.cms/files/upload", { method: "POST" }),
            async () => new Response("ok"),
        );
        expect(response.status).toBe(401);
        expect(response.headers.get("location")).toBeNull();
    });
});

function unauthenticated(): Authentication {
    return {
        loginUrl: "/login",
        logoutUrl: "/logout",
        profileUrl: "/profile",
        buildLoginUrl: (returnTo) => `/login?returnTo=${encodeURIComponent(returnTo)}`,
        buildLogoutUrl: (returnTo) => `/logout?returnTo=${encodeURIComponent(returnTo)}`,
        getSubject: async () => null,
    };
}

describe("Control API authorization", () => {
    test("rejects administrative APIs for authenticated members", async () => {
        expect(await apiStatus("GET", "/cms/api/users", false)).toBe(403);
        expect(await apiStatus("POST", "/cms/api/collections/install", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/system/settings", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/secrets", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/identity/providers", false)).toBe(403);
    });

    test("allows only member self-service routes", async () => {
        expect(await apiStatus("GET", "/cms/api/profil", false)).toBe(200);
        expect(await apiStatus("POST", "/cms/api/profil/password", false)).toBe(200);
        expect(await apiStatus("GET", "/cms/api/pats", false)).toBe(200);
        expect(await apiStatus("GET", "/cms/api/users", false)).toBe(403);
    });

    test("allows administrators through every Control API route", async () => {
        expect(await apiStatus("DELETE", "/cms/api/users?sub=member", true)).toBe(200);
        expect(await apiStatus("PATCH", "/cms/api/files", true)).toBe(200);
    });
});

describe("Control collection maintenance", () => {
    test("keeps reads and recovery endpoints available while fencing ordinary writes", async () => {
        const cms = {
            config: {
                collections: {
                    siteId: "site",
                    migrations: { getActive: async () => ({ id: "migration", status: "failed" }) },
                },
            },
        } as unknown as ControlCms;
        const guard = createControlMaintenanceGuard(cms);
        const next = async () => new Response("ok");

        expect((await guard(new Request("http://localhost/api/page"), next)).status).toBe(200);
        expect((await guard(new Request("http://localhost/api/page", { method: "PUT" }), next)).status).toBe(423);
        expect(
            (await guard(new Request("http://localhost/api/collections/migration/rollback", { method: "POST" }), next))
                .status,
        ).toBe(200);
    });
});

async function status(method: string, path: string): Promise<number> {
    const guard = createControlAccessGuard("/cms", new InMemoryAuthentication());
    const response = await guard(new Request(`http://localhost${path}`, { method }), async () => new Response("ok"));
    return response.status;
}

async function apiStatus(method: string, path: string, administrator: boolean): Promise<number> {
    const auth = new InMemoryAuthentication();
    const cms = { auth, config: { administrator: async () => administrator } } as unknown as ControlCms;
    const guard = createControlApiAuthorizationGuard("/cms", cms);
    try {
        return (await guard(new Request(`http://localhost${path}`, { method }), async () => new Response("ok"))).status;
    } catch (error) {
        return (error as { status?: number }).status ?? 500;
    }
}
