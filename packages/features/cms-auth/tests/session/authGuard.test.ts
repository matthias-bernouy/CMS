import { describe, expect, mock, spyOn, test } from "bun:test";
import { createAuthGuard, resolveRequestSubject } from "@bernouy/cms-auth";
import { requestTimingSnapshot } from "@bernouy/http-runner/observability";
import { TestAuthentication } from "./requestSubjectSupport";

describe("createAuthGuard", () => {
    test("allows authenticated subjects", async () => {
        const authentication = new TestAuthentication(async () => ({ identifier: "member-1" }));
        const guard = createAuthGuard({ basePath: "/cms", auth: authentication });
        const request = new Request("http://localhost/cms/api/status");

        const response = await guard(request, async () =>
            Response.json({ subject: await resolveRequestSubject(authentication, request) }),
        );

        expect(response.status).toBe(200);
        expect(authentication.calls).toBe(1);
        expect(requestTimingSnapshot(request).cms_auth).toBeGreaterThanOrEqual(0);
        expect(await response.json()).toEqual({ subject: { identifier: "member-1" } });
    });

    test("keeps authentication failures unauthenticated", async () => {
        const debug = spyOn(console, "debug").mockImplementation(() => undefined);
        const next = mock(async () => new Response("unexpected"));
        const authentication = new TestAuthentication(async () => {
            throw new Error("authentication unavailable");
        });
        const guard = createAuthGuard({ basePath: "/cms", auth: authentication });

        try {
            const response = await guard(new Request("http://localhost/cms/api/status"), next);
            expect(response.status).toBe(302);
            expect(response.headers.get("location")).toBe("/login?returnTo=%2Fcms%2Fapi%2Fstatus");
            expect(next).not.toHaveBeenCalled();
        } finally {
            debug.mockRestore();
        }
    });

    test("lets API surfaces replace the browser login redirect", async () => {
        const guard = createAuthGuard({
            basePath: "/.cms/management",
            auth: new TestAuthentication(async () => null),
            onUnauthenticated: (_request, context) =>
                Response.json({ code: "unauthorized", loginUrl: context.loginUrl }, { status: 401 }),
        });

        const response = await guard(new Request("http://localhost/.cms/management/status"), async () => {
            throw new Error("unexpected downstream call");
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
            code: "unauthorized",
            loginUrl: "/login?returnTo=%2F.cms%2Fmanagement%2Fstatus",
        });
    });

    test("still lets downstream failures escape the guard", async () => {
        const authentication = new TestAuthentication(async () => ({ identifier: "member-1" }));
        const guard = createAuthGuard({ basePath: "/cms", auth: authentication });

        await expect(
            guard(new Request("http://localhost/cms/api/status"), async () => {
                throw new Error("downstream failed");
            }),
        ).rejects.toThrow("downstream failed");
        expect(authentication.calls).toBe(1);
    });
});
