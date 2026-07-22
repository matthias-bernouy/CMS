import { describe, expect, test } from "bun:test";
import { createLocalUser, deleteUserCompletely, isLastAdmin } from "@bernouy/cms-auth";
import { InMemoryLocalCredentialStore } from "cms-auth/default-implementation/memory/InMemoryLocalCredentialStore";
import { InMemoryPatRepository } from "cms-auth/default-implementation/memory/InMemoryPatRepository";
import { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";

type Role = "admin" | "editor";

describe("local account lifecycle", () => {
    test("creates a verified local membership with a namespaced subject", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const users = new InMemoryUsersRepository<Role>();

        const user = await createLocalUser(
            { credentials, users },
            { email: " Admin@Example.com ", password: "safe-password", role: "admin" },
        );

        expect(user).toMatchObject({
            email: "admin@example.com",
            provider: "local",
            role: "admin",
        });
        expect(user.sub).toStartWith("local:");
        expect((await credentials.getByEmail("admin@example.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    test("purges local credentials and personal tokens before membership", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const users = new InMemoryUsersRepository<Role>();
        const pats = new InMemoryPatRepository();
        const user = await createLocalUser(
            { credentials, users },
            { email: "admin@example.com", password: "safe-password", role: "admin" },
        );
        await pats.create({ sub: user.sub, name: "laptop" });
        await pats.create({ sub: user.sub, name: "automation" });

        await deleteUserCompletely({ credentials, users, pats }, user);

        expect(await credentials.getByEmail("admin@example.com")).toBeNull();
        expect(await pats.list(user.sub)).toEqual([]);
        expect(await users.getBySub(user.sub)).toBeNull();
    });
});

describe("isLastAdmin", () => {
    test("distinguishes a sole admin from non-admins and a multi-admin team", async () => {
        const users = new InMemoryUsersRepository<Role>();
        await users.upsert({ sub: "admin-1" }, "admin");
        await users.upsert({ sub: "editor" }, "editor");

        expect(await isLastAdmin(users, "editor")).toBe(false);
        expect(await isLastAdmin(users, "admin-1")).toBe(true);

        await users.upsert({ sub: "admin-2" }, "admin");
        expect(await isLastAdmin(users, "admin-1")).toBe(false);
    });
});
