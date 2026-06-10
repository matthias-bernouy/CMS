import type { ControlCms } from "cms-control/ControlCms";
import type { TUser } from "@bernouy/auth-core";
import type { CMS_ROLES } from "types/roles";

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
export async function deleteUserCompletely(cms: ControlCms, user: TUser<CMS_ROLES>): Promise<void> {
    if (user.provider === "local" && user.email) {
        const cred = await cms.credentials.getByEmail(user.email);
        if (cred) await cms.credentials.delete(cred.sub);
    }
    const pats = await cms.pats.list(user.sub);
    for (const p of pats) await cms.pats.revoke(p.id);
    await cms.users.delete(user.sub);
}
