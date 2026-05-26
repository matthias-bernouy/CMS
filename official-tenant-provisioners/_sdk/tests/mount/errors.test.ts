import { test, expect } from "bun:test";
import { toProblem, problemResponse, RFC7807_CONTENT_TYPE } from "src/core/http/problem";
import {
    AuthError, PlaneError, SuspendedError,
    ProvisioningError, ConfigError,
} from "src/core/errors";

test("each family → right status / slug / title / content-type", () => {
    expect(toProblem(new AuthError()).status).toBe(401);
    expect(toProblem(new PlaneError()).body.type).toBe("urn:tenant-provisioner:error/plane");
    expect(toProblem(new SuspendedError()).body.type).toBe("urn:tenant-provisioner:error/suspended");
    const r = problemResponse(new AuthError(), { instance: "/x" });
    expect(r.headers.get("Content-Type")).toBe(RFC7807_CONTENT_TYPE);
    expect(r.status).toBe(401);
});

test("401/403 detail is OPAQUE — never the thrown message", () => {
    const a = toProblem(new AuthError("kid k3 unknown for iss https://t1"));
    expect(a.body.detail).toBe("Authentication failed.");
    expect(JSON.stringify(a.body)).not.toContain("kid k3");

    const p = toProblem(new PlaneError('role "tenant" not allowed on plane "admin"'));
    expect(p.body.detail).toBe("Forbidden.");
    expect(JSON.stringify(p.body)).not.toContain("admin");

    // suspended vs plane are distinguishable by `type`, detail still opaque
    expect(toProblem(new SuspendedError("tenant t1 is suspended")).body.detail).toBe("Forbidden.");
});

test("400/404/409 keep the actionable message (hub/config facing)", () => {
    const c = toProblem(new ProvisioningError("tenant t1 bound to another issuer", 409));
    expect(c.status).toBe(409);
    expect(c.body.detail).toContain("another issuer");
    expect(c.body.type).toBe("urn:tenant-provisioner:error/provisioning");
});

test("ConfigError and unknown errors → 500, opaque, no leak", () => {
    const cfg = toProblem(new ConfigError("zod: providerId required; allowlist empty"));
    expect(cfg.status).toBe(500);
    expect(cfg.body.detail).toBe("Internal error.");
    expect(JSON.stringify(cfg.body)).not.toContain("zod");

    const plain = toProblem(new Error("stack-y internal boom"));
    expect(plain.status).toBe(500);
    expect(plain.body.detail).toBe("Internal error.");
    expect(plain.body.type).toBe("urn:tenant-provisioner:error/internal");
});

test("instance + custom typeBase reflected", () => {
    const p = toProblem(new AuthError(), {
        instance: "/notes", typeBase: "https://acme.example/errors/",
    });
    expect(p.body.instance).toBe("/notes");
    expect(p.body.type).toBe("https://acme.example/errors/auth");
});
