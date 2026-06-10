import { describe, test, expect } from "bun:test";
import {
    ValidatingRolesRepository, InMemoryRolesRepository, RoleValidationError,
    ADMIN_ROLE, USER_ROLE, cmsPermission,
} from "@bernouy/cms-permissions";

const repo = () => new ValidatingRolesRepository(new InMemoryRolesRepository());

describe("ValidatingRolesRepository", () => {
    test("a valid custom role is stored (delegation)", async () => {
        const r = repo();
        await r.upsert({ id: "editor", label: "Editor", grants: [{ permission: cmsPermission("pages", "edit") }] });
        expect((await r.get("editor"))?.label).toBe("Editor");
    });

    test("the virtual admin super-role can never be stored", async () => {
        await expect(repo().upsert({ id: ADMIN_ROLE, label: "Admin", grants: [] }))
            .rejects.toBeInstanceOf(RoleValidationError);
    });

    test("a malformed id is rejected at the seam (direct upsert, no upsertRole)", async () => {
        await expect(repo().upsert({ id: "Bad Id!", label: "x", grants: [] }))
            .rejects.toThrow(/id/);
    });

    test("an out-of-catalogue CMS grant is rejected at the seam", async () => {
        await expect(repo().upsert({ id: "editor", label: "x", grants: [{ permission: "urn:cms:nope:write" }] }))
            .rejects.toThrow(/unknown CMS permission/);
    });

    test("a gateway-endpoint grant (non urn:cms:*) passes through", async () => {
        const r = repo();
        await r.upsert({ id: "caller", label: "Caller", grants: [{ permission: "urn:shop:getCart" }] });
        expect((await r.get("caller"))?.grants).toHaveLength(1);
    });

    test("built-in roles cannot be deleted at the seam; thrown errors carry .status 400", async () => {
        const r = repo();
        await expect(r.delete(USER_ROLE)).rejects.toMatchObject({ status: 400 });
        await expect(r.delete(ADMIN_ROLE)).rejects.toMatchObject({ status: 400 });
        expect(await r.get(USER_ROLE)).not.toBeNull();
    });

    test("a custom role still deletes (delegation)", async () => {
        const r = repo();
        await r.upsert({ id: "editor", label: "Editor", grants: [] });
        await r.delete("editor");
        expect(await r.get("editor")).toBeNull();
    });
});
