import { CMS_PERMISSIONS, type Grant } from "@bernouy/cms-permissions";
import type { RoleDto } from "@bernouy/cms-content";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

export type { RoleDto } from "@bernouy/cms-content";

/** Parse + validate a `POST /api/roles` body into a `RoleDto`. */
export function parseRoleDto(body: Record<string, unknown>): RoleDto {
    const id    = typeof body.id    === "string" ? body.id.trim()    : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!id)    throw new InvalidParam("id", "required");
    if (!label) throw new InvalidParam("label", "required");
    return { id, label, grants: parseGrants(body.grants) };
}

/** Validate the optional `grants` payload. CMS-namespaced permissions
 *  (`urn:cms:*`) must exist in the catalogue; other ids (gateway endpoint urns)
 *  are accepted as-is. `condition` is reserved (V1) and dropped. */
function parseGrants(raw: unknown): Grant[] {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw new InvalidParam("grants", "array expected");
    return raw.map((g) => {
        const permission = g && typeof g === "object" && typeof (g as { permission?: unknown }).permission === "string"
            ? (g as { permission: string }).permission.trim()
            : "";
        if (!permission) throw new InvalidParam("grants", "each grant needs a permission");
        if (permission.startsWith("urn:cms:") && !CMS_PERMISSIONS.includes(permission)) {
            throw new InvalidParam("grants", `unknown CMS permission ${permission}`);
        }
        return { permission };
    });
}
