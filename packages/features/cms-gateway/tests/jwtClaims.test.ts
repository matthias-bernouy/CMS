import { describe, expect, test } from "bun:test";
import { resolveJwtClaims, validateJwtClaimsConfig } from "cms-gateway/core/jwt/claims";

const req = new Request("http://local/.cms/gateway/shop/me");

describe("resolveJwtClaims", () => {
    test("keeps static claims unchanged", async () => {
        const result = await resolveJwtClaims({
            aud: "upstream",
            admin: false,
            scopes: ["read", "write"],
        }, req, {});

        expect(result).toEqual({
            ok: true,
            claims: { aud: "upstream", admin: false, scopes: ["read", "write"] },
        });
    });

    test("resolves the userID ref through deps", async () => {
        const result = await resolveJwtClaims({
            sub: "$userID",
            aud: "upstream",
        }, req, {
            resolveContext: async () => ({ userID: "user-123" }),
        });

        expect(result).toEqual({
            ok: true,
            claims: { sub: "user-123", aud: "upstream" },
        });
    });

    test("missing userID resolver is a 500 result", async () => {
        const result = await resolveJwtClaims({ sub: "$userID" }, req, {});

        expect(result).toEqual({
            ok: false,
            status: 500,
            message: 'claim "sub" requires a configured gateway context resolver',
        });
    });

    test("unauthenticated userID resolver is a 401 result", async () => {
        const result = await resolveJwtClaims({ sub: "$userID" }, req, {
            resolveContext: async () => ({}),
        });

        expect(result).toEqual({
            ok: false,
            status: 401,
            message: 'claim "sub" requires an authenticated user',
        });
    });
});

describe("validateJwtClaimsConfig", () => {
    test("accepts static claims and userID refs", () => {
        expect(validateJwtClaimsConfig({
            sub: "$userID",
            aud: "upstream",
            admin: false,
            scopes: ["read"],
        })).toBeNull();
    });

    test("rejects unknown refs", () => {
        expect(validateJwtClaimsConfig({ sub: "$email" }))
            .toBe('jwt claim "sub" has an invalid value');
    });
});
