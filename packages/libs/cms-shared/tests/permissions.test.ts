import { describe, test, expect } from "bun:test";
import {
    can, grantsFor, defaultRoleDefinitions,
    cmsPermission, CMS_PERMISSIONS, CMS_PERMISSION_CATALOGUE,
    USER_ROLE, PUBLIC_ROLE, ADMIN_ROLE,
    type RolesConfig, type Grant,
} from "@bernouy/cms-shared";

const roles = (definitions: RolesConfig["definitions"]): RolesConfig => ({ definitions });

describe("can", () => {
    const grants: Grant[] = [
        { permission: cmsPermission("users", "create") },
        { permission: "urn:stripe:getInvoice" },
    ];

    test("grants an exact permission-id match (CMS capability + gateway endpoint)", () => {
        expect(can(grants, cmsPermission("users", "create"))).toBe(true);
        expect(can(grants, "urn:stripe:getInvoice")).toBe(true);
    });

    test("denies a permission not held", () => {
        expect(can(grants, cmsPermission("users", "delete"))).toBe(false);
        expect(can(grants, "urn:stripe:listInvoices")).toBe(false);
    });

    test("denies on an empty grant set (deny-by-default)", () => {
        expect(can([], cmsPermission("users", "create"))).toBe(false);
    });

    test("ignores the reserved condition field (V1)", () => {
        const conditional: Grant[] = [{ permission: "urn:x:y", condition: { only: "me" } }];
        expect(can(conditional, "urn:x:y")).toBe(true);
    });
});

describe("grantsFor", () => {
    const cfg = roles([
        { id: USER_ROLE, label: "User", builtin: true, grants: [] },
        { id: "redacteur", label: "Rédacteur", grants: [{ permission: cmsPermission("pages", "edit") }] },
    ]);

    test("returns a role's grants", () => {
        expect(grantsFor("redacteur", cfg)).toEqual([{ permission: cmsPermission("pages", "edit") }]);
    });

    test("returns [] for the empty built-in user role", () => {
        expect(grantsFor(USER_ROLE, cfg)).toEqual([]);
    });

    test("returns [] for an unknown role (deny-by-default)", () => {
        expect(grantsFor("ghost", cfg)).toEqual([]);
    });

    test("returns [] for the virtual admin super-role (never stored)", () => {
        // admin owns no stored grants; callers short-circuit it before can().
        expect(grantsFor(ADMIN_ROLE, cfg)).toEqual([]);
    });
});

describe("defaultRoleDefinitions", () => {
    test("seeds the two editable built-ins with empty grants", () => {
        const defs = defaultRoleDefinitions();
        expect(defs.map((d) => d.id).sort()).toEqual([PUBLIC_ROLE, USER_ROLE].sort());
        expect(defs.every((d) => d.builtin === true && d.grants.length === 0)).toBe(true);
    });

    test("does NOT seed the virtual admin super-role", () => {
        expect(defaultRoleDefinitions().some((d) => d.id === ADMIN_ROLE)).toBe(false);
    });

    test("returns a fresh array each call (no shared mutable state)", () => {
        expect(defaultRoleDefinitions()).not.toBe(defaultRoleDefinitions());
    });
});

describe("CMS permission catalogue", () => {
    test("cmsPermission builds the urn:cms:<feature>:<verb> shape", () => {
        expect(cmsPermission("users", "view")).toBe("urn:cms:users:view");
    });

    test("CMS_PERMISSIONS is the flattened catalogue, all unique non-empty ids", () => {
        const expected = CMS_PERMISSION_CATALOGUE.reduce((n, f) => n + f.verbs.length, 0);
        expect(CMS_PERMISSIONS.length).toBe(expected);
        expect(new Set(CMS_PERMISSIONS).size).toBe(CMS_PERMISSIONS.length);
        expect(CMS_PERMISSIONS.every((p) => p.startsWith("urn:cms:"))).toBe(true);
        expect(CMS_PERMISSIONS).toContain(cmsPermission("users", "create"));
    });
});
