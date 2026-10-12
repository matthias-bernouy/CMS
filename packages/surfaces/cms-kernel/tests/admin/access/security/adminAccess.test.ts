import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication, type Authentication } from "@bernouy/cms-auth";
import {
    createAuthenticatedAdminGuard,
    createAdminAccessGuard,
    createAdminAdministratorGuard,
} from "cms-kernel/core/admin/runtime/adminAccess";
import { createAdminMaintenanceGuard } from "cms-kernel/core/admin/runtime/maintenance";

describe("Admin authenticated access", () => {
    test("allows authenticated members through the Admin guard", async () => {
        expect(await status("POST", "/cms/.cms/call/commerce/refund")).toBe(200);
        expect(await status("GET", "/cms/admin/settings/secrets")).toBe(200);
    });
});

describe("Admin machine route authentication", () => {
    test("returns an API response instead of a login redirect for CMS transports", async () => {
        const guard = createAuthenticatedAdminGuard("/cms", unauthenticated());
        const response = await guard(
            new Request("http://localhost/cms/.cms/call/ulvia.cms.files/uploads", { method: "POST" }),
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

describe("Admin kernel mutation authorization", () => {
    test("protects binary mutations with the administrator grant", async () => {
        expect(await administratorStatus(false)).toBe(403);
        expect(await administratorStatus(true)).toBe(200);
    });
});

describe("Admin collection maintenance", () => {
    test("keeps reads and recovery endpoints available while fencing ordinary writes", async () => {
        const guard = createAdminMaintenanceGuard({
            siteId: "site",
            store: {} as never,
            migrations: { getActive: async () => ({ id: "migration", status: "failed" }) } as never,
        });
        const next = async () => new Response("ok");

        expect(
            (await guard(new Request("http://localhost/.cms/call/ulvia.cms.files/files/file/generation"), next)).status,
        ).toBe(200);
        expect(
            (
                await guard(
                    new Request("http://localhost/.cms/call/ulvia.cms.files/uploads/upload", { method: "PUT" }),
                    next,
                )
            ).status,
        ).toBe(423);
        expect(
            (
                await guard(
                    new Request("http://localhost/.cms/call/ulvia.cms.collections/rollback-migration", {
                        method: "POST",
                    }),
                    next,
                )
            ).status,
        ).toBe(200);
        for (const capability of [
            "ulvia.cms.collections/migration-status",
            "ulvia.cms.jobs/get",
            "ulvia.cms.jobs/list",
        ]) {
            expect(
                (await guard(new Request(`http://localhost/.cms/call/${capability}`, { method: "POST" }), next)).status,
            ).toBe(200);
        }
    });
});

async function status(method: string, path: string): Promise<number> {
    const guard = createAdminAccessGuard("/cms", new InMemoryAuthentication());
    const response = await guard(new Request(`http://localhost${path}`, { method }), async () => new Response("ok"));
    return response.status;
}

async function administratorStatus(administrator: boolean): Promise<number> {
    const auth = new InMemoryAuthentication();
    const guard = createAdminAdministratorGuard(auth, async () => administrator);
    try {
        return (
            await guard(
                new Request("http://localhost/cms/.cms/call/ulvia.cms.files/uploads", { method: "POST" }),
                async () => new Response("ok"),
            )
        ).status;
    } catch (error) {
        return (error as { status?: number }).status ?? 500;
    }
}
