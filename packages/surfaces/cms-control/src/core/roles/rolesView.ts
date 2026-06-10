import type { ControlCms } from "cms-control/ControlCms";
import { ADMIN_ROLE, PUBLIC_ROLE } from "@bernouy/cms-permissions";

export type RoleSummary = { id: string; label: string };

/**
 * Roles a human user may be ASSIGNED: the virtual `admin` super-role, the
 * built-in `user`, and every custom role — but NOT `public`, which is the
 * anonymous pseudo-role (used at enforcement time when there is no subject, not
 * something granted to a person). Backs the role dropdowns + assignment
 * validation (`/api/roles/list`, `role.post`, `users.post`).
 */
export async function assignableRoles(cms: ControlCms): Promise<RoleSummary[]> {
    const { roles } = await cms.repository.getSystem();
    const out: RoleSummary[] = [{ id: ADMIN_ROLE, label: "Admin" }];
    for (const d of roles.definitions) {
        if (d.id === PUBLIC_ROLE || d.id === ADMIN_ROLE) continue;
        out.push({ id: d.id, label: d.label });
    }
    return out;
}

export type RoleRow = {
    id:    string;
    label: string;
    /** "System" for built-in roles (admin/user/public), "Custom" otherwise. */
    kind:  string;
    /** Display for the permissions column: "Full access" for the admin super-role
     *  (it bypasses every check), else the grant count as text. */
    permissions: string;
    /** Inline style hiding the per-row edit control (admin is not editable; the
     *  data-binding has no conditional rendering). */
    hideEdit: string;
    /** Inline style hiding the per-row delete control for non-deletable rows
     *  (built-ins / admin). */
    hideDelete: string;
};

/**
 * The Roles management table view: the virtual `admin` (read-only, full access)
 * followed by every stored definition (`user`, `public`, customs), each with a
 * grant count and a per-row delete-visibility flag (built-ins / admin are not
 * deletable).
 */
export async function manageableRoles(cms: ControlCms): Promise<RoleRow[]> {
    const { roles } = await cms.repository.getSystem();
    const rows: RoleRow[] = [
        // The virtual super-role: shown read-only as full-access (not editable,
        // not deletable), never as a misleading "0 permissions".
        { id: ADMIN_ROLE, label: "Admin", kind: "System", permissions: "Full access", hideEdit: "display:none", hideDelete: "display:none" },
    ];
    for (const d of roles.definitions) {
        rows.push({
            id:          d.id,
            label:       d.label,
            kind:        d.builtin ? "System" : "Custom",
            permissions: String(d.grants.length),
            hideEdit:    "",                                  // user / public / custom are all editable
            hideDelete:  d.builtin ? "display:none" : "",
        });
    }
    return rows;
}
