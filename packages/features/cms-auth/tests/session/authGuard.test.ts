import { describe, expect, mock, spyOn, test } from "bun:test";
import { createAuthGuard, InMemoryAuthentication, resolveRequestSubject } from "@bernouy/cms-auth";
import { requestTimingSnapshot } from "@bernouy/http-runner/observability";
import { TestAuthentication } from "./requestSubjectSupport";

type Role = "admin" | "user" | "custom";

describe("createAuthGuard role access", () => {
    test("keeps requiredRole as the default access rule", async () => {
        expect((await guardedResponse("admin")).status).toBe(200);
        expect((await guardedResponse("custom")).status).toBe(403);
        expect((await guardedResponse("user")).status).toBe(403);
    });

    test("shares the guard subject with downstream work on the same request", async () => {
        const authentication = new TestAuthentication<Role>(async () => ({
            identifier: "admin-1",
            role: "admin",
        }));
        const guard = createAuthGuard<Role>({
            basePath: "/cms",
            auth: authentication,
            requiredRole: "admin",
        });
        const request = new Request("http://localhost/cms/api/status");

        const response = await guard(request, async () =>
            Response.json({ subject: await resolveRequestSubject(authentication, request) }),
        );

        expect(response.status).toBe(200);
        expect(authentication.calls).toBe(1);
        expect(requestTimingSnapshot(request).cms_auth).toBeGreaterThanOrEqual(0);
        expect(await response.json()).toEqual({
            subject: { identifier: "admin-1", role: "admin" },
        });
    });

    test("keeps authentication failures unauthenticated", async () => {
        const debug = spyOn(console, "debug").mockImplementation(() => undefined);
        const next = mock(async () => new Response("unexpected"));
        const authentication = new TestAuthentication<Role>(async () => {
            throw new Error("authentication unavailable");
        });
        const guard = createAuthGuard<Role>({
            basePath: "/cms",
            auth: authentication,
            requiredRole: "admin",
        });

        try {
            const response = await guard(new Request("http://localhost/cms/api/status"), next);

            expect(response.status).toBe(302);
            expect(response.headers.get("location")).toBe("/login?returnTo=%2Fcms%2Fapi%2Fstatus");
            expect(next).not.toHaveBeenCalled();
        } finally {
            debug.mockRestore();
        }
    });

    test("still lets downstream failures escape the guard", async () => {
        const authentication = new TestAuthentication<Role>(async () => ({
            identifier: "admin-1",
            role: "admin",
        }));
        const guard = createAuthGuard<Role>({
            basePath: "/cms",
            auth: authentication,
            requiredRole: "admin",
        });

        await expect(
            guard(new Request("http://localhost/cms/api/status"), async () => {
                throw new Error("downstream failed");
            }),
        ).rejects.toThrow("downstream failed");
        expect(authentication.calls).toBe(1);
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
