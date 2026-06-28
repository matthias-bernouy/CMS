import { describe, test, expect } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryUsersRepository } from "@bernouy/cms-auth";
import { CompositeSourceRepository, InMemorySourceRepository, SYSTEM_SOURCES } from "@bernouy/cms-sources";
import { cmsPermission, ADMIN_ROLE, USER_ROLE, PUBLIC_ROLE } from "@bernouy/cms-permissions";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import type { RoleDefinition } from "@bernouy/cms-permissions";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { parseRoleDto } from "cms-control/core/roles/mutateRole";
import { assignableRoles, manageableRoles } from "cms-control/core/roles/rolesView";
import { roleEditorData } from "cms-control/core/roles/editorData";

/** Minimal ControlCms stand-in: the role helpers touch `roles` + `users`
 *  (+ `repository`/`gateway` for the editor catalogue). */
function makeCms() {
    const repository = new InMemoryCmsRepository();
    const users = new InMemoryUsersRepository();
    const roles = new InMemoryRolesRepository();
    return { cms: { repository, users, roles } as unknown as ControlCms, repository, users, roles };
}

async function seedRole(roles: InMemoryRolesRepository, def: RoleDefinition): Promise<void> {
    await roles.upsert(def);
}

describe("parseRoleDto", () => {
    test("requires id and label", () => {
        expect(() => parseRoleDto({ label: "X" })).toThrow(InvalidParam);
        expect(() => parseRoleDto({ id: "x" })).toThrow(InvalidParam);
    });

    test("defaults grants to [] when absent", () => {
        expect(parseRoleDto({ id: "editor", label: "Editor" })).toEqual({ id: "editor", label: "Editor", grants: [] });
    });

    test("rejects a non-array grants payload", () => {
        expect(() => parseRoleDto({ id: "x", label: "X", grants: "nope" })).toThrow(InvalidParam);
    });

    test("accepts a known CMS permission and a gateway urn", () => {
        const dto = parseRoleDto({ id: "x", label: "X", grants: [
            { permission: cmsPermission("users", "view") },
            { permission: "urn:stripe:getInvoice" },
        ] });
        expect(dto.grants).toEqual([
            { permission: cmsPermission("users", "view") },
            { permission: "urn:stripe:getInvoice" },
        ]);
    });

    test("rejects conditional grants until an evaluator exists", () => {
        expect(() => parseRoleDto({ id: "x", label: "X", grants: [
            { permission: cmsPermission("users", "view"), condition: { foo: 1 } },
        ] })).toThrow(InvalidParam);
    });
});

describe("assignableRoles", () => {
    test("fresh system → admin + user, never public", async () => {
        const { cms } = makeCms();
        const ids = (await assignableRoles(cms)).map((r) => r.id);
        expect(ids).toContain(ADMIN_ROLE);
        expect(ids).toContain(USER_ROLE);
        expect(ids).not.toContain(PUBLIC_ROLE);
    });

    test("includes custom roles after creation", async () => {
        const { cms, roles } = makeCms();
        await seedRole(roles, { id: "editor", label: "Editor", grants: [] });
        expect((await assignableRoles(cms)).map((r) => r.id)).toContain("editor");
    });
});

describe("manageableRoles", () => {
    test("admin is a read-only System row shown as 'Full access', built-ins not deletable", async () => {
        const { cms } = makeCms();
        const rows = await manageableRoles(cms);
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
        expect(byId[ADMIN_ROLE]!.kind).toBe("System");
        expect(byId[ADMIN_ROLE]!.permissions).toBe("Full access");
        expect(byId[ADMIN_ROLE]!.hideDelete).toBe("display:none");
        expect(byId[USER_ROLE]!.kind).toBe("System");
        expect(byId[USER_ROLE]!.hideDelete).toBe("display:none");
        expect(byId[PUBLIC_ROLE]).toBeDefined();
    });

    test("custom role is deletable and reflects its grant count", async () => {
        const { cms, roles } = makeCms();
        await seedRole(roles, { id: "editor", label: "Editor", grants: [{ permission: cmsPermission("pages", "edit") }] });
        const row = (await manageableRoles(cms)).find((r) => r.id === "editor")!;
        expect(row.hideDelete).toBe("");
        expect(row.permissions).toBe("1");
        expect(row.kind).toBe("Custom");
    });
});

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
        await seedRole(roles, { id: "editor", label: "Editor", grants: [{ permission: cmsPermission("pages", "edit") }] });
        const data = await roleEditorData(cms, "editor");
        expect(data.role.grants).toEqual([cmsPermission("pages", "edit")]);
    });

    test("no gateway configured → empty gateway catalogue", async () => {
        const { cms } = makeCms();
        expect((await roleEditorData(cms, USER_ROLE)).catalog.gateway).toEqual([]);
    });

    test("groups gateway endpoints by provider label", async () => {
        const repository = new InMemoryCmsRepository();
        const users = new InMemoryUsersRepository();
        const roles = new InMemoryRolesRepository();
        const gateway = new InMemorySourceRepository();
        await gateway.createSource({
            urn: "urn:stripe",
            meta: { name: "Stripe" },
            endpoints: [{ urn: "urn:stripe:getInvoice", method: "GET", targetUrl: "https://api.stripe.com/{id}", meta: { name: "Get invoice" } }],
        });
        const cms = { repository, users, roles, sources: gateway } as unknown as ControlCms;
        const groups = (await roleEditorData(cms, USER_ROLE)).catalog.gateway;
        expect(groups).toHaveLength(1);
        expect(groups[0]!.label).toBe("Stripe");
        expect(groups[0]!.endpoints).toEqual([{ id: "urn:stripe:getInvoice", label: "Get invoice" }]);
    });

    test("does not expose system providers as role permissions", async () => {
        const repository = new InMemoryCmsRepository();
        const users = new InMemoryUsersRepository();
        const roles = new InMemoryRolesRepository();
        const gateway = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const cms = { repository, users, roles, sources: gateway } as unknown as ControlCms;

        expect((await roleEditorData(cms, USER_ROLE)).catalog.gateway).toEqual([]);
    });
});
