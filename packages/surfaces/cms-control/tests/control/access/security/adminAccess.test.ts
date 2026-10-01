import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import type { ControlCms } from "cms-control/ControlCms";
import {
    createControlAccessGuard,
    createControlApiAuthorizationGuard,
} from "cms-control/core/admin/control/adminAccess";

describe("Control authenticated access", () => {
    test("allows authenticated members through the Control guard", async () => {
        expect(await status("GET", "/cms/api/users")).toBe(200);
        expect(await status("POST", "/cms/.cms/call/commerce/refund")).toBe(200);
        expect(await status("GET", "/cms/admin/settings/secrets")).toBe(200);
    });
});

describe("Control API authorization", () => {
    test("rejects administrative APIs for authenticated members", async () => {
        expect(await apiStatus("GET", "/cms/api/users", false)).toBe(403);
        expect(await apiStatus("POST", "/cms/api/collections/install", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/system/settings", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/secrets", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/identity/providers", false)).toBe(403);
    });

    test("allows only member self-service and assigned dashboard reads", async () => {
        expect(await apiStatus("GET", "/cms/api/my-dashboards", false)).toBe(200);
        expect(await apiStatus("GET", "/cms/api/dashboard-view?dashboardId=one", false)).toBe(200);
        expect(await apiStatus("GET", "/cms/api/dashboard-context?dashboardId=one", false)).toBe(200);
        expect(await apiStatus("GET", "/cms/api/profil", false)).toBe(200);
        expect(await apiStatus("POST", "/cms/api/profil/password", false)).toBe(200);
        expect(await apiStatus("GET", "/cms/api/pats", false)).toBe(200);
        expect(await apiStatus("POST", "/cms/api/my-dashboards", false)).toBe(403);
        expect(await apiStatus("GET", "/cms/api/dashboard-viewer", false)).toBe(403);
    });

    test("allows administrators through every Control API route", async () => {
        expect(await apiStatus("DELETE", "/cms/api/users?sub=member", true)).toBe(200);
        expect(await apiStatus("PATCH", "/cms/api/files", true)).toBe(200);
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
