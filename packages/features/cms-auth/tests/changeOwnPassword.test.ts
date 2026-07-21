import { describe, test, expect } from "bun:test";
import { changeOwnPassword, AuthValidationError } from "@bernouy/cms-auth";
import { InMemoryLocalCredentialStore } from "cms-auth/default-implementation/memory/InMemoryLocalCredentialStore";
import type { TUser } from "cms-auth/interfaces/UsersRepository";

function user(patch: Partial<TUser> = {}): TUser {
    return {
        sub: "local:u1",
        provider: "local",
        email: "a@x.com",
        role: "user",
        createdAt: new Date(),
        lastSeenAt: new Date(),
        ...patch,
    };
}

describe("changeOwnPassword", () => {
    test("requires a local account with the current password before changing it", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        await credentials.create({ email: "a@x.com", password: "old-password" });

        await changeOwnPassword({ credentials }, user(), "old-password", "new-password");

        expect(await credentials.verify("a@x.com", "old-password")).toBeNull();
        expect(await credentials.verify("a@x.com", "new-password")).not.toBeNull();
    });

    test("rejects non-local users", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        await expect(
            changeOwnPassword({ credentials }, user({ provider: "oidc" }), "old-password", "new-password"),
        ).rejects.toMatchObject({ field: "provider" });
    });

    test("rejects an incorrect current password", async () => {
        const credentials = new InMemoryLocalCredentialStore();
        await credentials.create({ email: "a@x.com", password: "old-password" });

        await expect(
            changeOwnPassword({ credentials }, user(), "wrong-password", "new-password"),
        ).rejects.toBeInstanceOf(AuthValidationError);
        expect(await credentials.verify("a@x.com", "old-password")).not.toBeNull();
    });
});
