import { describe, expect, test } from "bun:test";
import { createAuthGuard, InMemoryAuthentication } from "@bernouy/cms-auth";

type Role = "admin" | "user" | "custom";

describe("createAuthGuard role access", () => {
    test("keeps requiredRole as the default access rule", async () => {
        expect((await guardedResponse("admin")).status).toBe(200);
        expect((await guardedResponse("custom")).status).toBe(403);
        expect((await guardedResponse("user")).status).toBe(403);
    });
});

async function guardedResponse(role: Role): Promise<Response> {
    const guard = createAuthGuard<Role>({
        basePath: "/cms",
        auth: new InMemoryAuthentication<Role>({ role }),
        requiredRole: "admin",
    });
    return guard(new Request("http://localhost/cms/api/status"), async () => new Response("ok"));
}
