import { expect, test } from "bun:test";
import { InMemoryLocalCredentialStore, InMemoryPatRepository, InMemoryUsersRepository } from "@bernouy/auth";
import { createLocalUser, deleteUserCompletely } from "@bernouy/auth/management";

test("the host deletion guard runs before any credential, PAT or membership mutation", async () => {
    const credentials = new InMemoryLocalCredentialStore();
    const pats = new InMemoryPatRepository();
    const users = new InMemoryUsersRepository();
    const stores = { credentials, pats, users, revokeSessionsForSub: async () => {} };
    const user = await createLocalUser(stores, { email: "owner@example.test", password: "safe-password" });
    const token = await pats.create({ sub: user.sub, name: "publication" });
    let identityCleanup = false;
    await expect(
        deleteUserCompletely(
            {
                ...stores,
                withUserDeletion: async (sub) => {
                    expect(sub).toBe(user.sub);
                    throw new Error("Account still owns resources");
                },
                beforeMembershipDelete: async () => {
                    identityCleanup = true;
                },
            },
            user,
        ),
    ).rejects.toThrow("still owns");
    expect(identityCleanup).toBe(false);
    expect(await credentials.getByEmail("owner@example.test")).not.toBeNull();
    expect(await pats.verify(token.token)).toEqual({ sub: user.sub });
    expect(await users.getBySub(user.sub)).not.toBeNull();

    let locked = false;
    await deleteUserCompletely(
        {
            ...stores,
            withUserDeletion: async (sub, deletion) => {
                expect(sub).toBe(user.sub);
                locked = true;
                try {
                    await deletion();
                    expect(await users.getBySub(user.sub)).toBeNull();
                    expect(await credentials.getByEmail("owner@example.test")).toBeNull();
                    expect(await pats.verify(token.token)).toBeNull();
                } finally {
                    locked = false;
                }
            },
            beforeMembershipDelete: async () => {
                expect(locked).toBe(true);
                identityCleanup = true;
            },
        },
        user,
    );
    expect(identityCleanup).toBe(true);
    expect(locked).toBe(false);
});
