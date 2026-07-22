import type { Grant } from "@bernouy/cms-permissions";
import type { RoleDto } from "@bernouy/cms-permissions";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export type { RoleDto } from "@bernouy/cms-permissions";

/** Parse a `POST /api/roles` body into a `RoleDto`: presence + shape coercion.
 *  The grant catalogue rule lives in `upsertRole` (cms-permissions). */
export function parseRoleDto(body: Record<string, unknown>): RoleDto {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!id) {
        throw new InvalidParam("id", "required");
    }
    if (!label) {
        throw new InvalidParam("label", "required");
    }
    return { id, label, grants: parseGrants(body.grants) };
}

/** Extract the optional `grants` payload into typed `Grant[]` (shape only;
 *  conditional grants are rejected until an evaluator exists. Catalogue
 *  validation is done at write time. */
function parseGrants(raw: unknown): Grant[] {
    if (raw === undefined || raw === null) {
        return [];
    }
    if (!Array.isArray(raw)) {
        throw new InvalidParam("grants", "array expected");
    }
    return raw.map((g) => {
        const permission =
            g && typeof g === "object" && typeof (g as { permission?: unknown }).permission === "string"
                ? (g as { permission: string }).permission.trim()
                : "";
        if (!permission) {
            throw new InvalidParam("grants", "each grant needs a permission");
        }
        if ((g as { condition?: unknown }).condition !== undefined) {
            throw new InvalidParam("grants", "conditional grants are not supported yet");
        }
        return { permission };
    });
}
