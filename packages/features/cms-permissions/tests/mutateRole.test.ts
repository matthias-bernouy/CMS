import { describe, expect, test } from "bun:test";
import {
    ADMIN_ROLE,
    PUBLIC_ROLE,
    USER_ROLE,
    cmsPermission,
    deleteRole,
    upsertRole,
    RoleConflictError,
    RoleValidationError,
} from "@bernouy/cms-permissions";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";

function makeStores(holders = 0) {
    const roles = new InMemoryRolesRepository();
    const users = { list: async () => ({ total: holders }) };
    return { roles, users };
}

describe("upsertRole", () => {
    test("creates a custom role", async () => {
        const { roles } = makeStores();
        const saved = await upsertRole(roles, { id: "editor", label: "Editor", grants: [] });
        expect(saved).toEqual({ id: "editor", label: "Editor", grants: [] });
    });

    test("rejects the virtual admin id", async () => {
        const { roles } = makeStores();
        await expect(upsertRole(roles, { id: ADMIN_ROLE, label: "Admin", grants: [] })).rejects.toThrow(RoleValidationError);
    });

    test("rejects an invalid slug on create", async () => {
        const { roles } = makeStores();
        await expect(upsertRole(roles, { id: "Bad Id!", label: "X", grants: [] })).rejects.toThrow(RoleValidationError);
    });

    test("rejects an unknown urn:cms permission grant", async () => {
        const { roles } = makeStores();
        await expect(upsertRole(roles, { id: "editor", label: "X", grants: [{ permission: "urn:cms:users:fly" }] }))
            .rejects.toThrow(RoleValidationError);
    });

    test("rejects conditional grants until an evaluator exists", async () => {
        const { roles } = makeStores();
        await expect(upsertRole(roles, {
            id: "editor",
            label: "X",
            grants: [{ permission: cmsPermission("users", "view"), condition: { only: "me" } }],
        })).rejects.toThrow(RoleValidationError);
    });

    test("updates a custom role's label + grants", async () => {
        const { roles } = makeStores();
        await upsertRole(roles, { id: "editor", label: "Editor", grants: [] });
        const updated = await upsertRole(roles, { id: "editor", label: "Redacteur", grants: [{ permission: cmsPermission("pages", "edit") }] });
        expect(updated.label).toBe("Redacteur");
        expect(updated.grants).toHaveLength(1);
    });

    test("updating a built-in role changes grants but keeps its fixed label", async () => {
        const { roles } = makeStores();
        const updated = await upsertRole(roles, { id: USER_ROLE, label: "Renamed", grants: [{ permission: cmsPermission("files", "view") }] });
        expect(updated.label).toBe("User");
        expect(updated.builtin).toBe(true);
        expect(updated.grants).toHaveLength(1);
    });
});

describe("deleteRole", () => {
    test("rejects admin / built-in / unknown", async () => {
        const { roles, users } = makeStores();
        await expect(deleteRole(roles, users, ADMIN_ROLE)).rejects.toThrow(RoleValidationError);
        await expect(deleteRole(roles, users, USER_ROLE)).rejects.toThrow(RoleValidationError);
        await expect(deleteRole(roles, users, PUBLIC_ROLE)).rejects.toThrow(RoleValidationError);
        await expect(deleteRole(roles, users, "ghost")).rejects.toThrow(RoleValidationError);
    });

    test("refuses to delete a role still assigned to a user", async () => {
        const { roles, users } = makeStores(1);
        await upsertRole(roles, { id: "editor", label: "Editor", grants: [] });
        await expect(deleteRole(roles, users, "editor")).rejects.toThrow(RoleConflictError);
    });

    test("deletes an unused custom role", async () => {
        const { roles, users } = makeStores();
        await upsertRole(roles, { id: "editor", label: "Editor", grants: [] });
        await deleteRole(roles, users, "editor");
        expect(await roles.get("editor")).toBeNull();
    });
});
