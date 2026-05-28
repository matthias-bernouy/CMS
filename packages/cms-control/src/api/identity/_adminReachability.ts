import type { ControlCms } from "src/control/ControlCms";
import InvalidParam from "src/control/errors/Http/InvalidParam";

/**
 * Refuses an action (disable or delete a provider) that would leave no admin
 * able to sign in. An admin is "still reachable" iff their `provider` field
 * references a provider that remains enabled afterwards. Admins with no
 * `provider` field are NOT counted as reachable — defensive by design.
 *
 * PAT-based auth is intentionally NOT considered: tokens can be revoked or
 * expire, so the tenant must always retain a regular login path.
 *
 * The filename starts with `_` so `serveApi`'s `name.method.ts` filter
 * (`parts.length < 3` or middle part is not an HTTP verb) skips it.
 */
export async function assertAdminReachableAfterRemoving(
    cms: ControlCms,
    providerId: string,
    paramName: "enabled" | "id",
    refusalMessage: string,
): Promise<void> {
    const all = await cms.identityProviders.list();
    const enabledAfter = new Set(all.filter((p) => p.enabled && p.id !== providerId).map((p) => p.id));
    const admins = await cms.users.list({ role: "admin" });
    const reachable = admins.users.some((u) => u.provider && enabledAfter.has(u.provider));
    if (!reachable) throw new InvalidParam(paramName, refusalMessage);
}
