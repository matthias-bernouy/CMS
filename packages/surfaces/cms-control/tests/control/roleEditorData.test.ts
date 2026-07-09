import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryUsersRepository } from "@bernouy/cms-auth";
import { CompositeSourceRepository, InMemorySourceRepository, SYSTEM_SOURCES } from "@bernouy/cms-sources";
import { ADMIN_ROLE, InMemoryRolesRepository, USER_ROLE, cmsPermission } from "@bernouy/cms-permissions";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { roleEditorData } from "cms-control/core/roles/editorData";

function makeCms() {
    const repository = new InMemoryCmsRepository();
    const users = new InMemoryUsersRepository();
    const roles = new InMemoryRolesRepository();
    return { cms: { repository, users, roles } as unknown as ControlCms, repository, users, roles };
}

describe("roleEditorData", () => {
    test("rejects the virtual admin and unknown roles", async () => {
        const { cms } = makeCms();
        await expect(roleEditorData(cms, ADMIN_ROLE)).rejects.toThrow(InvalidParam);
        await expect(roleEditorData(cms, "ghost")).rejects.toThrow(InvalidParam);
    });

    test("returns the CMS catalogue grouped by feature with urn ids", async () => {
        const { cms } = makeCms();
        const data = await roleEditorData(cms, USER_ROLE);
        const users = data.catalog.cms.find((g) => g.feature === "users")!;
        expect(users.permissions.map((p) => p.id)).toContain(cmsPermission("users", "create"));
        expect(users.permissions.every((p) => p.id.startsWith("urn:cms:users:"))).toBe(true);
    });

    test("returns the role's grants as a flat permission-id list", async () => {
        const { cms, roles } = makeCms();
        await roles.upsert({ id: "editor", label: "Editor", grants: [{ permission: cmsPermission("pages", "edit") }] });
        const data = await roleEditorData(cms, "editor");
        expect(data.role.grants).toEqual([cmsPermission("pages", "edit")]);
    });

    test("no gateway configured returns an empty gateway catalogue", async () => {
        const { cms } = makeCms();
        expect((await roleEditorData(cms, USER_ROLE)).catalog.gateway).toEqual([]);
    });

    test("groups grantable gateway endpoints by provider label", async () => {
        const { repository, users, roles } = makeCms();
        const gateway = new InMemorySourceRepository();
        await gateway.createSource({
            urn: "urn:stripe",
            meta: { name: "Stripe" },
            endpoints: [{
                urn: "urn:stripe:getInvoice",
                method: "GET",
                access: { mode: "auth" },
                targetUrl: "https://api.stripe.com/{id}",
                meta: { name: "Get invoice" },
            }],
        });
        const cms = { repository, users, roles, sources: gateway } as unknown as ControlCms;
        const groups = (await roleEditorData(cms, USER_ROLE)).catalog.gateway;

        expect(groups).toHaveLength(1);
        expect(groups[0]!.label).toBe("Stripe");
        expect(groups[0]!.endpoints).toEqual([{ id: "urn:stripe:getInvoice", label: "Get invoice" }]);
    });

    test("does not expose system providers as role permissions", async () => {
        const { repository, users, roles } = makeCms();
        const gateway = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const cms = { repository, users, roles, sources: gateway } as unknown as ControlCms;

        expect((await roleEditorData(cms, USER_ROLE)).catalog.gateway).toEqual([]);
    });
});
