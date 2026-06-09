import { describe, test, expect } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-shared";
import { InMemoryUsersRepository } from "@bernouy/auth-core";
import { cmsPermission, ADMIN_ROLE, USER_ROLE, PUBLIC_ROLE } from "@bernouy/cms-shared";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import HttpError from "cms-control/errors/Http/HttpError";
import { parseRoleDto, upsertRole, deleteRole } from "cms-control/core/roles/mutateRole";
import { assignableRoles, manageableRoles } from "cms-control/core/roles/rolesView";

/** Minimal ControlCms stand-in: the role helpers only touch `repository` + `users`. */
function makeCms() {
    const repository = new InMemoryCmsRepository();
    const users = new InMemoryUsersRepository();
    return { cms: { repository, users } as unknown as ControlCms, repository, users };
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

    test("rejects an unknown urn:cms permission", () => {
        expect(() => parseRoleDto({ id: "x", label: "X", grants: [{ permission: "urn:cms:users:fly" }] })).toThrow(InvalidParam);
    });

    test("accepts a known CMS permission and a gateway urn, dropping condition", () => {
        const dto = parseRoleDto({ id: "x", label: "X", grants: [
            { permission: cmsPermission("users", "view"), condition: { foo: 1 } },
            { permission: "urn:stripe:getInvoice" },
        ] });
        expect(dto.grants).toEqual([
            { permission: cmsPermission("users", "view") },
            { permission: "urn:stripe:getInvoice" },
        ]);
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
        const { cms } = makeCms();
        await upsertRole(cms, { id: "editor", label: "Editor", grants: [] });
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
        const { cms } = makeCms();
        await upsertRole(cms, { id: "editor", label: "Editor", grants: [{ permission: cmsPermission("pages", "edit") }] });
        const row = (await manageableRoles(cms)).find((r) => r.id === "editor")!;
        expect(row.hideDelete).toBe("");
        expect(row.permissions).toBe("1");
        expect(row.kind).toBe("Custom");
    });
});

describe("upsertRole", () => {
    test("creates a custom role", async () => {
        const { cms } = makeCms();
        const saved = await upsertRole(cms, { id: "editor", label: "Editor", grants: [] });
        expect(saved).toEqual({ id: "editor", label: "Editor", grants: [] });
    });

    test("rejects the virtual admin id", async () => {
        const { cms } = makeCms();
        await expect(upsertRole(cms, { id: ADMIN_ROLE, label: "Admin", grants: [] })).rejects.toThrow(InvalidParam);
    });

    test("rejects an invalid slug on create", async () => {
        const { cms } = makeCms();
        await expect(upsertRole(cms, { id: "Bad Id!", label: "X", grants: [] })).rejects.toThrow(InvalidParam);
    });

    test("updates a custom role's label + grants", async () => {
        const { cms } = makeCms();
        await upsertRole(cms, { id: "editor", label: "Editor", grants: [] });
        const updated = await upsertRole(cms, { id: "editor", label: "Redacteur", grants: [{ permission: cmsPermission("pages", "edit") }] });
        expect(updated.label).toBe("Redacteur");
        expect(updated.grants).toHaveLength(1);
    });

    test("updating a built-in role changes grants but keeps its fixed label", async () => {
        const { cms } = makeCms();
        const updated = await upsertRole(cms, { id: USER_ROLE, label: "Renamed", grants: [{ permission: cmsPermission("files", "view") }] });
        expect(updated.label).toBe("User");          // label fixed
        expect(updated.builtin).toBe(true);
        expect(updated.grants).toHaveLength(1);
    });
});

describe("deleteRole", () => {
    test("rejects admin / built-in / unknown", async () => {
        const { cms } = makeCms();
        await expect(deleteRole(cms, ADMIN_ROLE)).rejects.toThrow(InvalidParam);
        await expect(deleteRole(cms, USER_ROLE)).rejects.toThrow(InvalidParam);
        await expect(deleteRole(cms, PUBLIC_ROLE)).rejects.toThrow(InvalidParam);
        await expect(deleteRole(cms, "ghost")).rejects.toThrow(InvalidParam);
    });

    test("refuses to delete a role still assigned to a user (409)", async () => {
        const { cms, users } = makeCms();
        await upsertRole(cms, { id: "editor", label: "Editor", grants: [] });
        await users.upsert({ sub: "u1" }, "editor");
        await expect(deleteRole(cms, "editor")).rejects.toThrow(HttpError);
    });

    test("deletes an unused custom role", async () => {
        const { cms } = makeCms();
        await upsertRole(cms, { id: "editor", label: "Editor", grants: [] });
        await deleteRole(cms, "editor");
        expect((await assignableRoles(cms)).map((r) => r.id)).not.toContain("editor");
    });
});
