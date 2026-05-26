import { test, expect } from "bun:test";
import { requireTenantScope } from "src/core/http/requireTenantScope";
import { setRequestAuth } from "src/core/http/requestAuth";
import { AuthError } from "src/core/errors";

function withAuth(scope: "tenant" | "user") {
    const req = new Request("http://t/tenant/config");
    setRequestAuth(req, {
        claims: { iss: "https://x", aud: "p", iat: 0, exp: 0, jti: "j",
                  ...(scope === "user" ? { sub: "u" } : {}) },
        role:   "tenant",
        scope,
        tenant: { tenantId: "t1", issuers: ["https://x"], role: "tenant", status: "active" },
    });
    return req;
}

test("scope=tenant (M2M, no sub) → passes", () => {
    expect(() => requireTenantScope(withAuth("tenant"))).not.toThrow();
});

test("scope=user (sub present) → AuthError", () => {
    expect(() => requireTenantScope(withAuth("user"))).toThrow(AuthError);
});

test("middleware bypass (no setRequestAuth) → AuthError via getRequestAuth", () => {
    expect(() => requireTenantScope(new Request("http://t/tenant/config"))).toThrow(AuthError);
});
