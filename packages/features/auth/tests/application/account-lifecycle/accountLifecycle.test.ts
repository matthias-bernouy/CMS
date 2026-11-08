import { describe, expect, test } from "bun:test";
import { createLocalUser, deleteUserCompletely } from "@bernouy/auth/management";
import { InMemoryLocalCredentialStore } from "auth/providers/default-implementation/memory/InMemoryLocalCredentialStore";
import { InMemoryPatRepository } from "auth/tokens/personal-access/default-implementation/memory/InMemoryPatRepository";
import { InMemoryUsersRepository } from "auth/accounts/default-implementation/memory/InMemoryUsersRepository";

describe("local account lifecycle", () => {
    test("creates a verified local membership with a namespaced subject", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const users = new InMemoryUsersRepository();

        const user = await createLocalUser(
            { credentials, users },
            { email: " Admin@Example.com ", password: "safe-password" },
        );

        expect(user).toMatchObject({
            email: "admin@example.com",
            provider: "local",
        });
        expect(user.sub).toStartWith("local:");
        expect((await credentials.getByEmail("admin@example.com"))?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    test("purges local credentials and personal tokens before membership", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        const users = new InMemoryUsersRepository();
        const pats = new InMemoryPatRepository();
        const user = await createLocalUser(
            { credentials, users },
            { email: "admin@example.com", password: "safe-password" },
        );
        await pats.create({ sub: user.sub, name: "laptop" });
        await pats.create({ sub: user.sub, name: "automation" });

        await deleteUserCompletely({ credentials, users, pats, revokeSessionsForSub: async () => {} }, user);

        expect(await credentials.getByEmail("admin@example.com")).toBeNull();
        expect(await pats.list(user.sub)).toEqual([]);
        expect(await users.getBySub(user.sub)).toBeNull();
    });
});
