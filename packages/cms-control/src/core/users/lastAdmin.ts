import type { ControlCms } from "cms-control/ControlCms";

/**
 * True when `sub` is an admin AND the only admin left. Deleting or demoting
 * them would lock everyone out of the tenant, so destructive endpoints guard
 * on this. The role check comes first so a non-admin never triggers the count.
 */
export async function isLastAdmin(cms: ControlCms, sub: string): Promise<boolean> {
    const user = await cms.users.getBySub(sub);
    if (user?.role !== "admin") return false;
    const admins = await cms.users.list({ role: "admin" });
    return admins.total <= 1;
}
