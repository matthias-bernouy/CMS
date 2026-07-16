import { describe, expect, test } from "bun:test";
import { InMemoryUsersRepository } from "@bernouy/cms-auth";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { migrateLegacyOperatorRoles } from "../src/migrateLegacyOperatorRoles";

describe("migrateLegacyOperatorRoles", () => {
    test("promotes legacy operators to admin and removes their definitions", async () => {
        const users = new InMemoryUsersRepository<string>();
        const roles = new InMemoryRolesRepository();
        await users.upsert({ sub: "support-user" }, "support");
        await users.upsert({ sub: "finance-user" }, "finance");
        await users.upsert({ sub: "regular-user" }, "user");
        await roles.upsert({ id: "support", label: "Support", grants: [] });
        await roles.upsert({ id: "finance", label: "Finance", grants: [] });
        await roles.upsert({ id: "custom", label: "Custom", grants: [] });

        const result = await migrateLegacyOperatorRoles(users, roles);

        expect(result).toEqual({
            promotedUsers: 2,
            removedRoleDefinitions: ["support", "finance"],
        });
        expect((await users.getBySub("support-user"))?.role).toBe("admin");
        expect((await users.getBySub("finance-user"))?.role).toBe("admin");
        expect((await users.getBySub("regular-user"))?.role).toBe("user");
        expect(await roles.get("support")).toBeNull();
        expect(await roles.get("finance")).toBeNull();
        expect(await roles.get("custom")).not.toBeNull();
    });

    test("is idempotent", async () => {
        const users = new InMemoryUsersRepository<string>();
        const roles = new InMemoryRolesRepository();

        expect(await migrateLegacyOperatorRoles(users, roles)).toEqual({
            promotedUsers: 0,
            removedRoleDefinitions: [],
        });
        expect(await migrateLegacyOperatorRoles(users, roles)).toEqual({
            promotedUsers: 0,
            removedRoleDefinitions: [],
        });
    });

    test("migrates every batch without skipping reassigned users", async () => {
        const users = new InMemoryUsersRepository<string>();
        const roles = new InMemoryRolesRepository();
        await Promise.all(Array.from({ length: 101 }, (_, index) =>
            users.upsert({ sub: `operator-${index}` }, "support")
        ));

        const result = await migrateLegacyOperatorRoles(users, roles);

        expect(result.promotedUsers).toBe(101);
        expect((await users.list({ role: "support" })).total).toBe(0);
        expect((await users.list({ role: "admin" })).total).toBe(101);
    });
});
