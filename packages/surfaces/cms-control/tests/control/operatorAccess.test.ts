import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { createControlAccessGuard } from "cms-control/core/control/operatorAccess";
import type { CMS_ROLES } from "types/roles";

describe("Control operator access", () => {
    test("allows support and finance only on dashboard source routes", async () => {
        for (const role of ["support", "finance"] as const) {
            expect(await status(role, "GET", "/cms/admin/sources")).toBe(200);
            expect(await status(role, "GET", "/cms/admin/sources/commerce")).toBe(200);
            expect(await status(role, "GET", "/cms/api/dashboards")).toBe(200);
            expect(await status(role, "GET", "/cms/api/profil")).toBe(200);
            expect(await status(role, "POST", "/cms/.cms/sources/commerce/refund")).toBe(200);
            expect(await status(role, "GET", "/cms/assets/control-components.js")).toBe(200);

            expect(await status(role, "GET", "/cms/api/users")).toBe(403);
            expect(await status(role, "POST", "/cms/api/profil/password")).toBe(403);
            expect(await status(role, "GET", "/cms/admin/users")).toBe(403);
            expect(await status(role, "GET", "/cms/admin/settings/secrets")).toBe(403);
        }
    });

    test("preserves unrestricted Control access for admin", async () => {
        expect(await status("admin", "GET", "/cms/api/users")).toBe(200);
        expect(await status("admin", "GET", "/cms/admin/settings/secrets")).toBe(200);
    });

    test("does not admit ordinary users", async () => {
        expect(await status("user", "GET", "/cms/api/dashboards")).toBe(403);
    });
});

async function status(role: CMS_ROLES, method: string, path: string): Promise<number> {
    const guard = createControlAccessGuard(
        "/cms",
        new InMemoryAuthentication<CMS_ROLES>({ role }),
    );
    const response = await guard(new Request(`http://localhost${path}`, { method }), async () => new Response("ok"));
    return response.status;
}
