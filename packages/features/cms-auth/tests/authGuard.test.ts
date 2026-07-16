import { describe, expect, test } from "bun:test";
import { createAuthGuard, InMemoryAuthentication } from "@bernouy/cms-auth";

type Role = "admin" | "user" | "support" | "finance";

describe("createAuthGuard role access", () => {
    test("keeps requiredRole as the default access rule", async () => {
        expect((await guardedResponse("admin")).status).toBe(200);
        expect((await guardedResponse("support")).status).toBe(403);
    });

    test("accepts the required role and explicitly allowed roles", async () => {
        const allowedRoles: Role[] = ["support", "finance"];

        expect((await guardedResponse("admin", allowedRoles)).status).toBe(200);
        expect((await guardedResponse("support", allowedRoles)).status).toBe(200);
        expect((await guardedResponse("finance", allowedRoles)).status).toBe(200);
        expect((await guardedResponse("user", allowedRoles)).status).toBe(403);
    });
});

async function guardedResponse(role: Role, allowedRoles?: readonly Role[]): Promise<Response> {
    const guard = createAuthGuard<Role>({
        basePath: "/cms",
        auth: new InMemoryAuthentication<Role>({ role }),
        requiredRole: "admin",
        ...(allowedRoles ? { allowedRoles } : {}),
    });
    return guard(new Request("http://localhost/cms/api/status"), async () => new Response("ok"));
}
