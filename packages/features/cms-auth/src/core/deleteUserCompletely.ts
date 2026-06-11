import type { UsersRepository, TUser } from "cms-auth/interfaces/UsersRepository";
import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { PatRepository } from "cms-auth/interfaces/PatRepository";

export type UserDeletionStores<Role extends string> = {
    users:       UsersRepository<Role>;
    credentials: LocalCredentialStore;
    pats:        PatRepository;
};

/**
 * Remove a user from every store that keys by their identity:
 *   - the local credential (authn) when it's a `local` account,
 *   - their Personal Access Tokens (orphans would resolve to no user anyway,
 *     but we purge for hygiene + to free the names),
 *   - the membership row (authz) — done LAST so a failure mid-way leaves the
 *     user still listed (and thus retry-able) rather than a half-deleted ghost.
 *
 * Callers must enforce the last-admin guard (`isLastAdmin`) BEFORE calling this.
 */
export async function deleteUserCompletely<Role extends string>(
    stores: UserDeletionStores<Role>,
    user: TUser<Role>,
): Promise<void> {
    if (user.provider === "local" && user.email) {
        const cred = await stores.credentials.getByEmail(user.email);
        if (cred) await stores.credentials.delete(cred.sub);
    }
    const pats = await stores.pats.list(user.sub);
    for (const p of pats) await stores.pats.revoke(user.sub, p.id);
    await stores.users.delete(user.sub);
}
