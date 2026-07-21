/**
 * Authorization vocabulary + pure decision helpers for the CMS's role-based
 * permissions. This module is the single source of truth for WHAT a permission
 * is; WHERE it is enforced (the admin guard, the gateway proxy) is wired
 * separately and is intentionally NOT part of this file.
 *
 * A permission is a single opaque id (a URN). There is NO separate action axis:
 *   - CMS capability   → `urn:cms:<feature>:<verb>` (the in-code catalogue below),
 *                        e.g. `urn:cms:users:create`.
 *   - gateway endpoint → `urn:<provider>:<endpoint>` (the URN the gateway already
 *                        mints), e.g. `urn:stripe:getInvoice` — holding it = "may call it".
 * A `Grant` pairs that permission with a reserved `condition` (always `undefined`
 * in V1 — conditional grants are rejected until an evaluator exists), the seam
 * for the future "by parameter" extension.
 *
 * Roles: `admin` is the virtual super-role — it owns NO stored grants and is
 * short-circuited by callers before `can()`; it is deliberately absent from the
 * stored `definitions`. `user` (authenticated default) and `public` (anonymous
 * visitor) are built-in, stored, and editable. Managers may add custom roles.
 */

/** CMS capabilities a role can be granted, grouped by feature for the grant
 *  editor UI. Each (feature, verb) pair is one permission, identified by the URN
 *  `urn:cms:<feature>:<verb>` (see `cmsPermission`). Source of truth for the
 *  CMS-capability vocabulary; gateway endpoints are NOT here — they carry their
 *  own `urn:<provider>:<endpoint>`. */
export const CMS_PERMISSION_CATALOGUE = [
    { feature: "users", label: "Users", verbs: ["view", "create", "delete"] },
    { feature: "roles", label: "Roles", verbs: ["view", "manage"] },
    { feature: "settings", label: "Settings", verbs: ["view", "edit"] },
    { feature: "gateway", label: "Gateway", verbs: ["view", "manage"] },
    { feature: "pages", label: "Pages", verbs: ["view", "edit", "delete"] },
    { feature: "files", label: "Files", verbs: ["view", "upload", "delete"] },
    { feature: "analytics", label: "Analytics", verbs: ["view"] },
] as const;

export type CmsFeature = (typeof CMS_PERMISSION_CATALOGUE)[number]["feature"];

/** Permission id for a CMS capability: `urn:cms:<feature>:<verb>`. */
export const cmsPermission = (feature: string, verb: string): string => `urn:cms:${feature}:${verb}`;

/** Flat list of every CMS-capability permission id, derived from the catalogue.
 *  The allow-list a role's CMS grants are validated against. */
export const CMS_PERMISSIONS: readonly string[] = CMS_PERMISSION_CATALOGUE.flatMap((f) =>
    f.verbs.map((v) => cmsPermission(f.feature, v)),
);

/** One permission held by a role. `permission` is the opaque id (CMS capability
 *  URN or gateway endpoint URN). `condition` is reserved for the later "by
 *  parameter" extension and must stay `undefined` until an evaluator exists. */
export type Grant = {
    permission: string;
    condition?: unknown;
};

/** A built-in or manager-defined role and its grants. `builtin` marks the
 *  non-deletable `user`/`public` roles. `admin` is virtual and never stored here. */
export type RoleDefinition = {
    id: string;
    label: string;
    builtin?: boolean;
    grants: Grant[];
};

/** The `roles` section persisted on `TSystem`. */
export type RolesConfig = {
    definitions: RoleDefinition[];
};

/** Built-in role id of the virtual super-role (bypasses all checks; not stored). */
export const ADMIN_ROLE = "admin";
/** Built-in role id assigned to authenticated users by default. */
export const USER_ROLE = "user";
/** Built-in role id representing the anonymous (unauthenticated) visitor. */
export const PUBLIC_ROLE = "public";

/** The roles seeded into a fresh `TSystem.roles.definitions`: the two editable
 *  built-ins with empty grants. `admin` is intentionally NOT seeded — it is the
 *  virtual super-role. Returns a fresh array so callers never share mutable state. */
export const defaultRoleDefinitions = (): RoleDefinition[] => [
    { id: USER_ROLE, label: "User", builtin: true, grants: [] },
    { id: PUBLIC_ROLE, label: "Public", builtin: true, grants: [] },
];

/** Grants of the role with id `roleId`, or `[]` when the role is unknown or has
 *  none (deny-by-default). NOTE: `admin` is virtual and yields `[]` here — callers
 *  must short-circuit the super-role BEFORE consulting `can()`. */
export function grantsFor(roleId: string, roles: RolesConfig): Grant[] {
    return roles.definitions.find((d) => d.id === roleId)?.grants ?? [];
}

/**
 * Grants effectively held by a subject role, including the built-in inheritance
 * chain used by CMS surfaces:
 *   public          -> public grants
 *   authenticated   -> public + user grants
 *   custom role     -> public + user + custom-role grants
 *
 * `admin` remains virtual and should still be short-circuited by callers.
 */
export function effectiveGrantsFor(roleId: string, roles: RolesConfig): Grant[] {
    if (roleId === ADMIN_ROLE) {
        return [];
    }
    const inheritedRoleIds =
        roleId === PUBLIC_ROLE
            ? [PUBLIC_ROLE]
            : roleId === USER_ROLE
              ? [PUBLIC_ROLE, USER_ROLE]
              : [PUBLIC_ROLE, USER_ROLE, roleId];
    const grants = inheritedRoleIds.flatMap((id) => grantsFor(id, roles));
    const seen = new Set<string>();
    return grants.filter((grant) => {
        const key = `${grant.permission}:${JSON.stringify(grant.condition)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/** Whether `grants` hold `permission`. V1 = exact id match with no condition.
 *  Conditional grants are denied until an evaluator exists. Deny-by-default. */
export function can(grants: Grant[], permission: string): boolean {
    return grants.some((g) => g.condition === undefined && g.permission === permission);
}

/** Whether a role effectively holds a permission, including built-in role
 *  inheritance and the virtual admin super-role. */
export function canRole(roleId: string, roles: RolesConfig, permission: string): boolean {
    if (roleId === ADMIN_ROLE) {
        return true;
    }
    return can(effectiveGrantsFor(roleId, roles), permission);
}
