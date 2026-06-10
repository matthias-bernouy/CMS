import { describe, test, expect } from "bun:test";
import { InMemoryRolesRepository, USER_ROLE, PUBLIC_ROLE, ADMIN_ROLE } from "@bernouy/cms-permissions";

describe("InMemoryRolesRepository", () => {
    test("a fresh store is seeded with the two editable built-ins (not admin)", async () => {
        const repo = new InMemoryRolesRepository();
        const ids = (await repo.list()).map((d) => d.id).sort();
        expect(ids).toEqual([PUBLIC_ROLE, USER_ROLE]);
        expect((await repo.list()).every((d) => d.builtin)).toBe(true);
        expect(await repo.get(ADMIN_ROLE)).toBeNull();
    });

    test("upsert adds a custom role; get returns a copy", async () => {
        const repo = new InMemoryRolesRepository();
        await repo.upsert({ id: "editor", label: "Editor", grants: [{ permission: "urn:cms:pages:edit" }] });
        const got = await repo.get("editor");
        expect(got).toEqual({ id: "editor", label: "Editor", grants: [{ permission: "urn:cms:pages:edit" }] });
        got!.label = "mutated";
        expect((await repo.get("editor"))!.label).toBe("Editor"); // stored copy untouched
    });

    test("upsert replaces an existing role", async () => {
        const repo = new InMemoryRolesRepository();
        await repo.upsert({ id: "editor", label: "Editor", grants: [] });
        await repo.upsert({ id: "editor", label: "Redacteur", grants: [{ permission: "x" }] });
        expect(await repo.get("editor")).toEqual({ id: "editor", label: "Redacteur", grants: [{ permission: "x" }] });
        expect(await repo.list()).toHaveLength(3); // user + public + editor
    });

    test("delete removes a role", async () => {
        const repo = new InMemoryRolesRepository();
        await repo.upsert({ id: "editor", label: "Editor", grants: [] });
        await repo.delete("editor");
        expect(await repo.get("editor")).toBeNull();
        expect((await repo.list()).map((d) => d.id).sort()).toEqual([PUBLIC_ROLE, USER_ROLE]);
    });

    test("list returns independent copies (mutating one doesn't leak)", async () => {
        const repo = new InMemoryRolesRepository();
        const first = await repo.list();
        first[0]!.grants.push({ permission: "leak" });
        expect((await repo.list())[0]!.grants).toEqual([]);
    });
});
