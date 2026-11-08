import type { UsersRepository, TUser } from "auth/accounts/interfaces/UsersRepository";
import type { LocalCredentialStore } from "auth/providers/interfaces/LocalCredentialStore";
import type { PatRepository } from "auth/tokens/personal-access/interfaces/PatRepository";

export type UserDeletionStores = {
    users: UsersRepository;
    credentials: LocalCredentialStore;
    pats: PatRepository;
    revokeSessionsForSub(sub: string): Promise<void>;
    /** Holds a host-owned lifecycle fence before any store is mutated. */
    withUserDeletion?: (sub: string, deletion: () => Promise<void>) => Promise<void>;
    beforeMembershipDelete?: (user: TUser) => Promise<void>;
};

/**
 * Remove a user from every store that keys by their identity:
 *   - the local credential (authn) when it's a `local` account,
 *   - their Personal Access Tokens (orphans would resolve to no user anyway,
 *     but we purge for hygiene + to free the names),
 *   - any host-owned identity records through `beforeMembershipDelete`,
 *   - the membership row (authz) — done LAST so a failure mid-way leaves the
 *     user still listed (and thus retry-able) rather than a half-deleted ghost.
 *
 */
export async function deleteUserCompletely(stores: UserDeletionStores, user: TUser): Promise<void> {
    const deletion = () => removeUserFromStores(stores, user);
    if (stores.withUserDeletion) {
        await stores.withUserDeletion(user.sub, deletion);
    } else {
        await deletion();
    }
}

async function removeUserFromStores(stores: UserDeletionStores, user: TUser): Promise<void> {
    await stores.revokeSessionsForSub(user.sub);
    if (user.provider === "local" && user.email) {
        const cred = await stores.credentials.getByEmail(user.email);
        if (cred) {
            await stores.credentials.delete(cred.sub);
        }
    }
    const pats = await stores.pats.list(user.sub);
    for (const p of pats) {
        await stores.pats.revoke(user.sub, p.id);
    }
    await stores.beforeMembershipDelete?.(user);
    await stores.users.delete(user.sub);
}
