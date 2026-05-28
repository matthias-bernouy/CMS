import { describe, test, expect } from "bun:test";
import { toLoginMethod } from "auth-core/auth/toLoginMethod";
import type { IdentityProvider } from "auth-core/interfaces/IdentityProvider";

const base = { displayName: "X", enabled: true, createdAt: new Date(), updatedAt: new Date() };
const local: IdentityProvider = { id: "local", kind: "local", ...base };
const oidc: IdentityProvider = { id: "keycloak", kind: "oidc", issuer: "https://kc", clientId: "c", ...base };

describe("toLoginMethod", () => {
    test("local → credentials form (fields, no loginUrl)", () => {
        const m = toLoginMethod(local, "/cms/t/auth");
        expect(m.fields).toEqual(["email", "password"]);
        expect(m.loginUrl).toBeUndefined();
    });

    test("oidc → redirect (loginUrl, no fields)", () => {
        const m = toLoginMethod(oidc, "/cms/t/auth");
        expect(m.loginUrl).toBe("/cms/t/auth/keycloak/login");
        expect(m.fields).toBeUndefined();
    });

    test("no `style` field is emitted (discriminated by loginUrl vs fields)", () => {
        expect("style" in toLoginMethod(oidc, "/cms/t/auth")).toBe(false);
    });

    test("icon is passed through when present", () => {
        const m = toLoginMethod({ ...oidc, icon: "/i.svg" }, "/cms/t/auth");
        expect(m.icon).toBe("/i.svg");
    });
});
