import { describe, test, expect } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryUsersRepository } from "@bernouy/cms-auth";
import { cmsPermission, ADMIN_ROLE, USER_ROLE, PUBLIC_ROLE } from "@bernouy/cms-permissions";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import type { RoleDefinition } from "@bernouy/cms-permissions";
import type { ControlCms } from "cms-control/ControlCms";
import setUserRole from "cms-control/api/_access/users/role.post";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { parseRoleDto } from "cms-control/core/management/roles/mutateRole";
import { assignableRoles, manageableRoles } from "cms-control/core/management/roles/rolesView";

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
        const dto = parseRoleDto({
            id: "x",
            label: "X",
            grants: [{ permission: cmsPermission("users", "view") }, { permission: "urn:stripe:getInvoice" }],
        });
        expect(dto.grants).toEqual([
            { permission: cmsPermission("users", "view") },
            { permission: "urn:stripe:getInvoice" },
        ]);
    });

    test("rejects conditional grants until an evaluator exists", () => {
        expect(() =>
            parseRoleDto({
                id: "x",
                label: "X",
                grants: [{ permission: cmsPermission("users", "view"), condition: { foo: 1 } }],
            }),
        ).toThrow(InvalidParam);
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

describe("setUserRole", () => {
    test("assigns a validated role to an existing user", async () => {
        const { cms, users } = makeCms();
        await users.upsert({ sub: "local:member", provider: "local", email: "member@example.com" }, USER_ROLE);
        const request = new Request("http://control.test/api/users/role", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sub: "local:member", role: ADMIN_ROLE }),
        });

        const response = await setUserRole(request, cms);

        expect(response.status).toBe(200);
        expect((await users.getBySub("local:member"))?.role).toBe(ADMIN_ROLE);
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
        await seedRole(roles, {
            id: "editor",
            label: "Editor",
            grants: [{ permission: cmsPermission("pages", "edit") }],
        });
        const row = (await manageableRoles(cms)).find((r) => r.id === "editor")!;
        expect(row.hideDelete).toBe("");
        expect(row.permissions).toBe("1");
        expect(row.kind).toBe("Custom");
    });
});
