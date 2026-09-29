import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { ControlCms } from "cms-control/ControlCms";
import { authSystem, CaptureRunner, mountedSourceHandler } from "./authPublicSupport";

describe("Control public auth mount", () => {
    test("mounts public auth routes unguarded and disables signup", async () => {
        const runner = CaptureRunner.withoutFileApi();
        const repository = new InMemoryCmsRepository();
        const { local, credentials, users, publicAuth } = authSystem();
        const cms = new ControlCms(
            runner,
            repository,
            local,
            { publicAuth },
            undefined,
            undefined,
            undefined,
            undefined,
            users,
            undefined,
            undefined,
            credentials,
            undefined,
            undefined,
            { local },
        );
        await cms.ready;

        expect(runner.endpoints.get("POST /.cms/auth/login")).toBe(0);
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(false);
    });

    test("does not expose system-auth through the Control Source proxy", async () => {
        const runner = CaptureRunner.withoutFileApi();
        const repository = new InMemoryCmsRepository();
        const { local, credentials, users, publicAuth } = authSystem();
        const gateway = new InMemorySourceRepository();
        const authenticated = new InMemoryAuthentication();
        const cms = new ControlCms(
            runner,
            repository,
            authenticated,
            { publicAuth },
            undefined,
            undefined,
            undefined,
            undefined,
            users,
            undefined,
            undefined,
            credentials,
            gateway,
            undefined,
            { local },
        );
        await cms.ready;

        const gatewayPost = runner.handlers.get("POST /.cms/sources");
        expect(gatewayPost).toBeDefined();

        const res = await gatewayPost!(
            new Request("http://control/.cms/sources/system-auth/signup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: "ada@example.com", password: "password-1" }),
            }),
        );

        expect(res.status).toBe(404);
        expect(await credentials.getByEmail("ada@example.com")).toBeNull();
    });

    test("allows authenticated members to call Control source endpoints", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:operator-actions",
            endpoints: [
                {
                    urn: "urn:operator-actions:refund",
                    method: "POST",
                    access: { mode: "auth" },
                    targetUrl: "https://operator.test/refund",
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () =>
            Response.json({ ok: true })) as unknown as typeof fetch);
        try {
            const handler = await mountedSourceHandler(sources);
            const allowed = await handler(
                new Request("http://control/.cms/sources/operator-actions/refund", { method: "POST" }),
            );
            expect(allowed.status).toBe(200);
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            const second = await handler(
                new Request("http://control/.cms/sources/operator-actions/refund", { method: "POST" }),
            );
            expect(second.status).toBe(200);
            expect(fetchSpy).toHaveBeenCalledTimes(2);
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
