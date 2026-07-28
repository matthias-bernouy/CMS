import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { createControlAccessGuard } from "cms-control/core/admin/control/adminAccess";
import type { CMS_ROLES } from "types/roles";

describe("Control administrator access", () => {
    test("rejects every non-admin role from protected routes", async () => {
        for (const role of ["support", "finance", "user", "custom"]) {
            expect(await status(role, "GET", "/cms/api/dashboards")).toBe(403);
            expect(await status(role, "POST", "/cms/.cms/sources/commerce/refund")).toBe(403);
            expect(await status(role, "GET", "/cms/admin/settings/secrets")).toBe(403);
        }
    });

    test("preserves unrestricted Control access for admin", async () => {
        expect(await status("admin", "GET", "/cms/api/users")).toBe(200);
        expect(await status("admin", "GET", "/cms/admin/settings/secrets")).toBe(200);
    });
});

async function status(role: CMS_ROLES, method: string, path: string): Promise<number> {
    const guard = createControlAccessGuard("/cms", new InMemoryAuthentication<CMS_ROLES>({ role }));
    const response = await guard(new Request(`http://localhost${path}`, { method }), async () => new Response("ok"));
    return response.status;
}
